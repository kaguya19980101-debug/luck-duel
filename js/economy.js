import { CHARACTERS } from './data.js';

export const DUPLICATE_SHARDS = Object.freeze({ R: 50, SR: 150, SSR: 500 });

// Existing accounts may contain copies from the old draw system. Convert once:
// after conversion each owned card has count 1, so subsequent logins do nothing.
export function normalizeAccount(account) {
    const next = account ? { ...account } : {};
    let changed = !account;

    if (next.coins === undefined) {
        next.coins = 10000;
        changed = true;
    }
    if (next.soulShards === undefined) {
        next.soulShards = 0;
        changed = true;
    }

    if (next.inventory) {
        const inventory = { ...next.inventory };
        for (const [id, entry] of Object.entries(inventory)) {
            const copies = Number(entry?.count);
            const card = CHARACTERS.find(char => char.id === id);
            if (!card || !Number.isInteger(copies) || copies <= 1) continue;
            next.soulShards += (copies - 1) * DUPLICATE_SHARDS[card.rarity];
            inventory[id] = { count: 1 };
            changed = true;
        }
        if (changed) next.inventory = inventory;
    }

    return changed ? next : undefined;
}

// Pure update function; safe to run again if the database transaction retries.
export function applySummon(account, cards, cost) {
    if (!account || !Number.isFinite(account.coins) || account.coins < cost) return null;

    const inventory = { ...(account.inventory || {}) };
    let soulShards = Number(account.soulShards) || 0;
    const results = cards.map(card => {
        if (inventory[card.id]) {
            const shards = DUPLICATE_SHARDS[card.rarity];
            soulShards += shards;
            inventory[card.id] = { count: 1 };
            return { ...card, isNew: false, shards };
        }
        inventory[card.id] = { count: 1 };
        return { ...card, isNew: true, shards: 0 };
    });

    return {
        account: { ...account, coins: account.coins - cost, soulShards, inventory },
        results
    };
}
