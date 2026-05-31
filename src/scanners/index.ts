import { aiScanner } from "./aiScanner.js";
import { apiScanner } from "./apiScanner.js";
import { repositoryScanner } from "./repositoryScanner.js";
import { securityScanner } from "./securityScanner.js";
import { uiScanner } from "./uiScanner.js";
import type { Scanner } from "../types/report.js";

export const scanners: Scanner[] = [
  repositoryScanner,
  securityScanner,
  apiScanner,
  uiScanner,
  aiScanner,
];
