// js/data.js

export const CHARACTERS = [
    // --- R 卡 (Fire / 火屬性) ---
    { id: "0001", name: "ichi",      attribute: "fire",  rarity: "R",   hp: 100, max_hp: 100, attack: 50, range: 1, img: "" },
    { id: "0002", name: "ni",        attribute: "fire",  rarity: "R",   hp: 110, max_hp: 110, attack: 50, range: 1, img: "" },
    { id: "0003", name: "san",       attribute: "fire",  rarity: "R",   hp: 120, max_hp: 120, attack: 50, range: 1, img: "" },

    // --- SR 卡 (Water / 水屬性) ---
    { id: "0004", name: "shi",       attribute: "water", rarity: "SR",  hp: 130, max_hp: 130, attack: 50, range: 1, img: "" },
    { id: "0005", name: "go",        attribute: "water", rarity: "SR",  hp: 140, max_hp: 140, attack: 50, range: 1, img: "" },
    { id: "0006", name: "roku",      attribute: "water", rarity: "SR",  hp: 150, max_hp: 150, attack: 50, range: 1, img: "" },

    // --- SR 卡 (Grass / 草屬性) ---
    { id: "0007", name: "nana",      attribute: "grass", rarity: "SR",  hp: 160, max_hp: 160, attack: 50, range: 1, img: "" },
    { id: "0008", name: "hachi",     attribute: "grass", rarity: "SR",  hp: 170, max_hp: 170, attack: 50, range: 1, img: "" },
    { id: "0009", name: "kyuu",      attribute: "grass", rarity: "SR",  hp: 180, max_hp: 180, attack: 50, range: 1, img: "" },

    // --- SSR 卡 (Dark / 暗屬性) ---
    { id: "0010", name: "jyuu",      attribute: "dark",  rarity: "SSR", hp: 190, max_hp: 190, attack: 50, range: 1, img: "" },
    { id: "0011", name: "jyuuichi",  attribute: "dark",  rarity: "SSR", hp: 200, max_hp: 200, attack: 50, range: 1, img: "" },
    { id: "0012", name: "jyuuni",    attribute: "dark",  rarity: "SSR", hp: 210, max_hp: 210, attack: 50, range: 1, img: "" },

    // --- SSR 卡 (Light / 光屬性) ---
    { id: "0013", name: "jyuusan",   attribute: "light", rarity: "SSR", hp: 220, max_hp: 220, attack: 50, range: 1, img: "" },
    { id: "0014", name: "jyuushi",   attribute: "light", rarity: "SSR", hp: 230, max_hp: 230, attack: 50, range: 1, img: "" },
    { id: "0015", name: "jyuugo",    attribute: "light", rarity: "SSR", hp: 240, max_hp: 240, attack: 50, range: 1, img: "" }
];

// 如果您之後做「戰鬥系統」需要隨機生成敵人隊伍，可以用這個函式
export function getRandomTeam(count) {
    const shuffled = [...CHARACTERS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}