// Structured checks, phase 3b (#502): the course topic tutor's cards. A choice
// check on one of the topic's concepts, then a recall check on another, judged
// against the tutor's commitment and recorded on a tap. The tutor's and the
// judge's replies are scripted; the page, the cards and the writes are real.
//
//   npm run demo:record -- --scenario scripts/demo-scenarios/topic-tutor-cards.mjs --out <file.mp4>

const choice = {
  kind: "choice",
  concept: "attention-weights",
  question: "After softmax, what do one query's attention weights over all keys add up to?",
  options: ["1, because softmax normalises them", "The number of keys", "0, because they centre on the mean", "Whatever the raw scores add up to"],
  why: "Softmax turns the scores into a probability distribution, so each query's weights are positive and sum to 1.",
  answer: "1, because softmax normalises them",
};

const recall = {
  kind: "recall",
  concept: "multi-head-attention",
  question: "Why run several attention heads instead of one big one?",
  answer:
    "Each head has its own query, key and value projections, so each can attend to a different kind of relation; one head can only average them into one pattern.",
};

export async function run({ page, base, cursor, routeChat, routeJson }) {
  await routeChat([
    { content: "Let's start where the topic starts: how one token weighs the others.", check: choice },
    {
      content:
        "Right, and at 70% you mostly had it. One more, in your own words this time, on why the block has several heads.",
      check: recall,
    },
    {
      content:
        "Yes. You named the separate projections, which is the point: each head learns its own idea of what is relevant. Next, where those heads' outputs go.",
    },
  ]);
  await routeJson("**/api/agent/judge", [
    { verdict: { correct: true, feedback: "Names separate projections per head, which is the core of it." } },
  ]);

  await page.goto(`${base}/courses/cp4284/m1-llm-foundations-recap/session?topic=cp4284-m1-t1`, { waitUntil: "load" });
  await cursor.pause(1400);
  await cursor.click(page.getByRole("button", { name: "Start Socratic dialogue" }));

  const card1 = page.locator("section[aria-labelledby]").filter({ hasText: choice.question });
  await card1.waitFor();
  await card1.scrollIntoViewIfNeeded();
  await cursor.pause(1500);
  await cursor.click(card1.getByRole("button", { name: choice.answer }));
  await cursor.click(card1.getByRole("radio", { name: "70%" }));
  await cursor.click(card1.getByRole("button", { name: "Submit" }));
  await card1.locator("[data-recorded]").waitFor();
  await card1.locator("[data-recorded]").scrollIntoViewIfNeeded();
  await cursor.pause(2400);

  const card2 = page.locator("section[aria-labelledby]").filter({ hasText: recall.question });
  await card2.waitFor();
  await card2.scrollIntoViewIfNeeded();
  await cursor.pause(1200);
  await cursor.type(card2.getByRole("textbox").first(), "Each head gets its own projections, so they can look for different relations at once.");
  await cursor.click(card2.getByRole("radio", { name: "50%" }));
  await cursor.click(card2.getByRole("button", { name: "Submit" }));
  const record = card2.getByRole("button", { name: "Record as correct" });
  await record.waitFor();
  await record.scrollIntoViewIfNeeded();
  await cursor.pause(1500);
  await cursor.click(record);
  await card2.locator("[data-recorded]").waitFor();
  await card2.locator("[data-recorded]").scrollIntoViewIfNeeded();
  await cursor.pause(1500);
  await page.getByText("You named the separate projections").scrollIntoViewIfNeeded();
  await cursor.pause(2600);
}
