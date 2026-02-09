// js/data.js
export const CHARACTERS = [
    { id: "0001", name: "A", attribute: "fire", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0002", name: "B", attribute: "fire", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0003", name: "C", attribute: "fire", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0004", name: "D", attribute: "water", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0005", name: "E", attribute: "water", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0006", name: "F", attribute: "water", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0007", name: "G", attribute: "grass", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0008", name: "H", attribute: "grass", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0009", name: "I", attribute: "grass", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" },
    { id: "0010", name: "J", attribute: "dark", hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R", img: "" }
];

// 隨機抽取 N 隻角色
export function getRandomTeam(count) {
    const shuffled = [...CHARACTERS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}