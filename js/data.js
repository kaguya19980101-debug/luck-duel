// js/data.js

// 根據您的 Excel 表格更新的角色資料
export const CHARACTERS = [
    { id: "0001", name: "ichi",  attribute: "fire",  hp: 1000, max_hp: 1000, attack: 500, range: 1, rarity: "R",   img: "" },
    { id: "0002", name: "ni",    attribute: "fire",  hp: 1100, max_hp: 1100, attack: 500, range: 1, rarity: "R",   img: "" },
    { id: "0003", name: "san",   attribute: "fire",  hp: 1200, max_hp: 1200, attack: 500, range: 1, rarity: "R",   img: "" },
    { id: "0004", name: "shi",   attribute: "water", hp: 1300, max_hp: 1300, attack: 500, range: 1, rarity: "SR",  img: "" },
    { id: "0005", name: "go",    attribute: "water", hp: 1400, max_hp: 1400, attack: 500, range: 1, rarity: "SR",  img: "" },
    { id: "0006", name: "roku",  attribute: "water", hp: 1500, max_hp: 1500, attack: 500, range: 1, rarity: "SR",  img: "" },
    { id: "0007", name: "nana",  attribute: "grass", hp: 1600, max_hp: 1600, attack: 500, range: 1, rarity: "SR",  img: "" },
    { id: "0008", name: "hachi", attribute: "grass", hp: 1700, max_hp: 1700, attack: 500, range: 1, rarity: "SSR", img: "" },
    { id: "0009", name: "kyuu",  attribute: "grass", hp: 1800, max_hp: 1800, attack: 500, range: 1, rarity: "SSR", img: "" },
    { id: "0010", name: "jyuu",  attribute: "dark",  hp: 1900, max_hp: 1900, attack: 500, range: 1, rarity: "SSR", img: "" }
];

// 隨機抽取 N 隻角色
export function getRandomTeam(count) {
    // 簡單的洗牌演算法
    const shuffled = [...CHARACTERS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}