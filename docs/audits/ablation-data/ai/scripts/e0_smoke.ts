import { addUser, makeStore } from "./lib.ts";
const { store, cleanup } = await makeStore("smoke");
await addUser(store, "u1");
console.log("ok");
await cleanup();
