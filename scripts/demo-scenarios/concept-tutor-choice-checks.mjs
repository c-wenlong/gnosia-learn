// Structured checks, phase 1 (#497): a choice check on the concept tutor,
// answered right at low confidence, then a second one answered wrong at high
// confidence. The tutor's turns are scripted; the card and the writes are real.
//
//   npm run demo:record -- --scenario scripts/demo-scenarios/concept-tutor-choice-checks.mjs --out <file.mp4>
const concept = "tool-calling";

const first = {
  kind: "choice",
  question: "When a model calls a tool, what does the model itself do?",
  options: [
    "Runs the function and reads its return value",
    "Writes structured text naming the tool and its arguments, then stops",
    "Stores the tool's result in its weights for next time",
    "Opens a connection to the tool's server",
  ],
  why: "The model only emits tokens. The harness parses the call, runs the function, and appends the result to the context [1].",
  answer: "Writes structured text naming the tool and its arguments, then stops",
};

const second = {
  kind: "choice",
  question: "You close the conversation after a tool call. What happens to the tool's result?",
  options: [
    "The model remembers it in its next conversation",
    "It is gone: it lived in the context, not the model",
    "The harness folds it into the model's weights overnight",
  ],
  why: "The result is a message in the context. Nothing about a tool call changes the model, so closing the conversation loses it [1].",
  answer: "It is gone: it lived in the context, not the model",
};

export async function run({ page, base, cursor, routeChat }) {
  await routeChat([
    {
      content: "Sure. The whole idea turns on who does what during a tool call, so let's start there.",
      check: first,
    },
    {
      content:
        "Right, and you said only 30%, so here is the piece to hold on to: the model never executes anything. It writes a call and stops, and the harness does the running [1]. One more, on where the result ends up.",
      check: second,
    },
    {
      content:
        "Not quite, and you were sure, so this is worth fixing now. The result is just another message in the context [1]. The weights never change during a conversation, so once it closes, the result is gone.",
    },
  ]);

  await page.goto(`${base}/learn/${concept}`, { waitUntil: "load" });
  await cursor.pause(1500);

  const composer = page.getByRole("textbox", { name: /Ask the tutor about/ });
  await cursor.type(composer, "Give me a check");
  await page.keyboard.press("Enter");

  const card1 = page.locator("section[aria-labelledby]").filter({ hasText: first.question });
  await card1.waitFor();
  await cursor.pause(1600);

  // Submit with nothing picked: the card asks for a pick first.
  await cursor.click(card1.getByRole("button", { name: "Submit" }));
  await cursor.pause(1200);

  await cursor.click(card1.getByRole("button", { name: first.answer }));
  await cursor.click(card1.getByRole("radio", { name: "30%" }));
  await cursor.type(card1.getByRole("textbox"), "I think it only writes text, but I'm not sure the harness runs it.");
  await cursor.click(card1.getByRole("button", { name: "Submit" }));

  await card1.locator("[data-recorded]").waitFor();
  await cursor.pause(2600);

  const card2 = page.locator("section[aria-labelledby]").filter({ hasText: second.question });
  await card2.waitFor();
  await card2.scrollIntoViewIfNeeded();
  await cursor.pause(1400);
  await cursor.click(card2.getByRole("button", { name: second.options[0] }));
  await cursor.click(card2.getByRole("radio", { name: "90%" }));
  await cursor.click(card2.getByRole("button", { name: "Submit" }));
  await card2.locator("[data-recorded]").waitFor();
  await page.getByText("Not quite, and you were sure").waitFor();
  await page.getByText("Not quite, and you were sure").scrollIntoViewIfNeeded();
  await cursor.pause(3000);
}
