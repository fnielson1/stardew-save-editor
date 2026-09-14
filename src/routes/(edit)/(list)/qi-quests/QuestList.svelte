<script lang="ts">
	import qiQuests from "$generated/qiquests.json";
	import type { QiQuests } from "$lib/proxies/QiQuests.svelte";
	import UiCheckbox from "$lib/ui/UICheckbox.svelte";
	import UiContainer from "$lib/ui/UIContainer.svelte";
	import UiInput from "$lib/ui/UIInput.svelte";

	interface Props {
		quests: QiQuests;
	}

	let { quests = $bindable() }: Props = $props();

	const MAX_AVAILABLE = 2;

	let filter = $state("");
	let regex = $derived.by(() => searchRegexp(filter));
	let atLimit = $derived(quests.size >= MAX_AVAILABLE);
	let inProgress = $derived(new Set(quests.inProgress));

	function searchRegexp(term: string) {
		try {
			return new RegExp(term, "i");
		} catch {
			console.warn("Invalid regex:", term);
			return /$^/; // Matches nothing
		}
	}
</script>

<UiContainer>
	<h3>Qi's Quests</h3>
	<p class="hint">
		The Walnut Room board only ever offers {MAX_AVAILABLE} at a time - select up
		to {MAX_AVAILABLE} ({quests.size}/{MAX_AVAILABLE} selected).
	</p>

	<div class="search">
		<UiInput type="text" placeholder="Search..." bind:value={filter} />
	</div>

	<div class="wrapper">
		{#each qiQuests as quest}
			{#if regex.test(quest.name)}
				{@const selected = quests.has(quest.questKey)}
				<label class="entry" class:disabled={!selected && atLimit}>
					<div class="key">
						<div class="text">
							<span class="name">
								{quest.name}
								{#if inProgress.has(quest.questKey)}
									<span class="tag">In Progress</span>
									<button
										type="button"
										class="cancel"
										data-testid="qi-quest-cancel-{quest.questKey.toLowerCase()}"
										onclick={() => quests.removeInProgress(quest.questKey)}
									>
										Cancel
									</button>
								{/if}
							</span>
							<span class="description">{quest.description}</span>
						</div>
					</div>

					<UiCheckbox
						class="checkbox"
						data-testid="qi-quest-{quest.questKey.toLowerCase()}"
						checked={selected}
						disabled={!selected && atLimit}
						onchange={() => {
							if (selected) {
								quests.delete(quest.questKey);
							} else if (!atLimit) {
								quests.add(quest.questKey);
							}
						}}
					/>
				</label>
			{/if}
		{/each}
	</div>
</UiContainer>

<style>
	.hint {
		margin: 0 4px 8px;
		font-size: 0.85em;
		opacity: 0.85;
	}

	.entry.disabled {
		opacity: 0.5;
	}

	.entry.disabled :global(.checkbox) {
		cursor: not-allowed;
	}

	.search :global(input) {
		width: 100%;
		margin: 4px;
		margin-bottom: 8px;
		font-size: large;
	}

	.wrapper {
		display: flex;
		flex-direction: column;
		height: 20rem;
		overflow-y: scroll;
	}

	.entry {
		display: flex;
		justify-content: space-between;
		/* Rows wrap to different heights depending on description length, so
		   align to the top instead of centering - otherwise checkboxes bob up
		   and down relative to a straight column. */
		align-items: flex-start;
		gap: 8px;
		border-bottom: #5b2b2a 1px solid;
		padding: 4px 0.5em;
	}

	.entry :global(.checkbox) {
		margin-top: 0.15rem;
		flex-shrink: 0;
	}

	.key {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.text {
		display: flex;
		flex-direction: column;
	}

	.name {
		font-weight: bold;
	}

	.tag {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 4px;
		border: 1px solid #5b2b2a;
		background-color: #f9bb65;
		font-size: 0.7em;
		font-weight: normal;
		vertical-align: middle;
	}

	.cancel {
		display: inline-block;
		margin-left: 4px;
		padding: 1px 6px;
		border-radius: 4px;
		border: 1px solid #5b2b2a;
		background: none;
		color: inherit;
		font-family: inherit;
		font-size: 0.7em;
		font-weight: normal;
		vertical-align: middle;
		cursor: pointer;
	}

	.cancel:hover {
		background-color: #5b2b2a;
		color: #f9bb65;
	}

	.description {
		font-size: 0.85em;
		opacity: 0.85;
	}
</style>
