import { SvelteSet } from "svelte/reactivity";
import qiQuestTemplates from "$generated/qiquests.json";
import type { SaveProxy } from "$lib/proxies/SaveFile.svelte";
import type {
	AvailableSpecialOrders,
	AvailableSpecialOrdersSpecialOrder,
	PurpleObjective,
	TileLocation,
} from "$types/save";
import { type DataProxy, Raw } from ".";

interface QiQuestObjectiveTemplate {
	type: string;
	description: string;
	maxCount: number;
	acceptableContextTagSets: string;
	dropBox?: string;
	dropBoxGameLocation?: string;
	dropBoxTileLocation?: string;
	minimumCapacity?: number;
	useShipmentValue?: boolean;
}

interface QiQuestTemplate {
	questKey: string;
	name: string;
	description: string;
	nameToken: string;
	descriptionToken: string;
	duration: string;
	durationDays: number;
	specialRule: string;
	objectives: QiQuestObjectiveTemplate[];
	rewardGems: number;
}

// The save format tags each objective/reward with an `xsi:type` derived from
// its content-data `Type` (e.g. content Type "Donate" -> save xsi:type
// "DonateObjective"; content Type "Money" -> save xsi:type "MoneyReward").
// Confirmed against tests/TestSave, since codegen/save.ts's generic
// PurpleObjective/RewardsReward types don't model this attribute themselves.
type QiObjective = PurpleObjective & {
	"@_xsi:type": string;
	useShipmentValue?: boolean;
};
type QiReward = { "@_xsi:type": string; amount: { int: number } };

const templatesByKey = new Map<string, QiQuestTemplate>(
	(qiQuestTemplates as QiQuestTemplate[]).map((template) => [
		template.questKey,
		template,
	]),
);

function parseTileLocation(raw: string | undefined): TileLocation | undefined {
	if (!raw) return undefined;
	const [x, y] = raw.split(" ").map(Number);
	if (x === undefined || y === undefined || Number.isNaN(x + y))
		return undefined;
	return { X: x, Y: y };
}

/**
 * Tracks which of Mr. Qi's Special Order challenges are currently offered
 * (available to accept) from the Walnut Room bulletin board.
 *
 * Only the "available" list is managed here - orders already accepted or
 * completed carry live per-player progress state that a checkbox can't
 * safely represent, so they're left untouched.
 */
export class QiQuests
	extends SvelteSet<string>
	implements DataProxy<AvailableSpecialOrders>
{
	public [Raw]: AvailableSpecialOrders;
	private saveData: SaveProxy;

	/**
	 * Qi Challenge quest key(s) already accepted and in progress (moved out
	 * of the board's `availableSpecialOrders` and into the player's
	 * `specialOrders`). Mirrored into a SvelteSet - rather than read directly
	 * off `[Raw]` on demand - because plain mutations of the raw save tree
	 * aren't otherwise tracked reactively (the same reason `add`/`delete`
	 * mutate `[Raw]` for export but drive the UI through `super.add`/
	 * `super.delete` instead).
	 */
	private acceptedQuestKeys: SvelteSet<string>;

	constructor(saveData: SaveProxy) {
		const available = saveData[Raw].SaveGame.availableSpecialOrders;
		const existing = available.SpecialOrder.filter((order) =>
			templatesByKey.has(order.questKey),
		).map((order) => order.questKey);

		super(existing);

		this[Raw] = available;
		this.saveData = saveData;

		// `specialOrders` parses as `""` rather than an object when no order
		// has ever been accepted (self-closing tag in the save's XML), which
		// the generated type doesn't capture - so this checks defensively.
		const active = saveData[Raw].SaveGame.specialOrders;
		const accepted =
			active && typeof active === "object"
				? active.SpecialOrder.filter((order) =>
						templatesByKey.has(order.questKey),
					).map((order) => order.questKey)
				: [];
		this.acceptedQuestKeys = new SvelteSet(accepted);
	}

	/**
	 * Qi Challenge quest key(s) already accepted and in progress. These carry
	 * live per-player progress that a checkbox can't represent (see class
	 * docstring) - exposed so the UI can flag them as active and, via
	 * `removeInProgress`, cancel them outright.
	 */
	get inProgress(): string[] {
		return [...this.acceptedQuestKeys];
	}

	/**
	 * Cancels an already-accepted Qi Challenge by removing it from the
	 * player's active `specialOrders`, discarding its in-progress state.
	 * This frees it up to be offered again on the board (via `add`) the
	 * next time the player visits Mr. Qi. Non-Qi orders are left alone.
	 */
	removeInProgress(questKey: string): void {
		const active = this.saveData[Raw].SaveGame.specialOrders;
		if (active && typeof active === "object") {
			active.SpecialOrder = active.SpecialOrder.filter(
				(order) => order.questKey !== questKey,
			);
		}

		this.acceptedQuestKeys.delete(questKey);
	}

	/**
	 * Synthesizes a fresh, valid special order entry from the game's static
	 * challenge data (objectives, rewards, duration) plus safe runtime
	 * defaults for fields that only make sense once an order is live
	 * (generation seed, participant/reward-claim state, due date).
	 */
	add(questKey: string): this {
		if (this.has(questKey)) return this;

		const template = templatesByKey.get(questKey);
		if (!template) return this;

		const daysPlayed =
			Number.parseInt(this.saveData.player[Raw].stats.daysPlayed, 10) || 0;

		const objectives: QiObjective[] = template.objectives.map((objective) => ({
			"@_xsi:type": `${objective.type}Objective`,
			currentCount: 0,
			maxCount: objective.maxCount,
			description: objective.description,
			failOnCompletion: false,
			acceptableContextTagSets: objective.acceptableContextTagSets,
			...(objective.dropBox
				? {
						dropBox: objective.dropBox,
						dropBoxGameLocation: objective.dropBoxGameLocation,
						dropBoxTileLocation: parseTileLocation(
							objective.dropBoxTileLocation,
						),
						confirmed: false,
					}
				: {}),
			...(objective.minimumCapacity !== undefined
				? { minimumCapacity: objective.minimumCapacity }
				: {}),
			...(objective.useShipmentValue !== undefined
				? { useShipmentValue: objective.useShipmentValue }
				: {}),
		}));

		const rewards: QiReward[] = [
			{ "@_xsi:type": "GemsReward", amount: { int: template.rewardGems } },
		];

		const entry: AvailableSpecialOrdersSpecialOrder = {
			preSelectedItems: "",
			selectedRandomElements: "",
			objectives,
			generationSeed: Math.floor(Math.random() * 2147483647),
			seenParticipantsIDs: "",
			participantsIDs: "",
			unclaimedRewardsIDs: "",
			appliedSpecialRules: false,
			rewards,
			questKey: template.questKey,
			// Kept as the raw `[Token]` (not resolved text) so the game can
			// re-resolve it for the player's current language, matching real
			// save data (confirmed against tests/TestSave).
			questName: template.nameToken,
			questDescription: template.descriptionToken,
			requester: "Qi",
			orderType: "Qi",
			specialRule: template.specialRule,
			readyForRemoval: false,
			itemToRemoveOnEnd: -1,
			dueDate: daysPlayed + template.durationDays,
			duration: template.duration,
			questState: "InProgress",
		};

		this[Raw].SpecialOrder.push(entry);
		super.add(questKey);
		return this;
	}

	delete(questKey: string): boolean {
		if (!this.has(questKey)) return false;

		this[Raw].SpecialOrder = this[Raw].SpecialOrder.filter(
			(order) => order.questKey !== questKey,
		);
		return super.delete(questKey);
	}
}
