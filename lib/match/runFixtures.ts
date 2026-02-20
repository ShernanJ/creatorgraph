import { runMatchFixtures } from "./fixtures";

try {
  runMatchFixtures();
  console.log("All match fixtures passed.");
} catch (err) {
  console.error("Match fixtures failed.");
  console.error(err);
  process.exit(1);
}
