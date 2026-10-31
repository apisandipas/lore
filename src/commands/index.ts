import { command as check } from "./check";
import { command as context } from "./context";
import { command as freeze } from "./freeze";
import { command as init } from "./init";
import { command as list } from "./list";
import { command as next } from "./next";
import { command as newNote } from "./new";
import { command as set } from "./set";
import type { Command } from "./shared";
import { command as show } from "./show";
import { command as tick } from "./tick";

// Every command lore runs, each declaring the flags it takes.
export const COMMANDS: Command[] = [init, context, show, list, check, newNote, set, tick, freeze, next];
