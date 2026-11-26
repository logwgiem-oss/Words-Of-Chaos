export const MODES = [
  {
    id: "caption",
    name: "Caption Chaos",
    description: "Write the funniest caption for the prompt.",
    prompt: "Write a funny caption for this situation:"
  },
  {
    id: "gap",
    name: "Fill the Gap",
    description: "Complete the sentence in the funniest way.",
    prompt: "Fill in the missing words:"
  },
  {
    id: "worst",
    name: "Worst Answer",
    description: "Come up with the worst possible answer.",
    prompt: "What is the worst possible answer to this?"
  },
  {
    id: "fake",
    name: "Fake It",
    description: "Invent a convincing but completely made-up answer.",
    prompt: "Invent a believable fake explanation for:"
  },
  {
    id: "picture",
    name: "Picture Perfect",
    description: "Describe the picture that would make this prompt hilarious.",
    prompt: "Describe the perfect picture for:"
  },
  {
    id: "telephone",
    name: "Drawing Telephone",
    description: "Turn the prompt into a description and watch the chain change.",
    prompt: "Describe this so another player could draw it:"
  },
  {
    id: "who",
    name: "Who Said That?",
    description: "Guess which player wrote each anonymous answer.",
    prompt: "Write something that the others might recognise as yours:"
  }
];

export const PROMPTS = {
  caption: [
    "A penguin arrives late to a job interview.",
    "The world's least helpful superhero.",
    "A dog has just discovered online shopping.",
    "A wizard tries to use a self-checkout machine."
  ],
  gap: [
    "The worst thing to hear from your pilot is ______.",
    "My secret talent is ______.",
    "Never trust someone who ______.",
    "The school trip went wrong when ______."
  ],
  worst: [
    "What should you never bring to a wedding?",
    "What is the worst name for a pet?",
    "What should never be included in a packed lunch?",
    "What is the worst thing to say on a first day?"
  ],
  fake: [
    "Why do flamingos stand on one leg?",
    "What is the real purpose of traffic cones?",
    "Why do cats stare at empty corners?",
    "What happens to missing socks?"
  ],
  picture: [
    "A very dramatic trip to the supermarket.",
    "A tiny problem treated like a world-ending disaster.",
    "An animal having a very human day.",
    "A completely unexpected use for a toaster."
  ],
  telephone: [
    "A dragon trying to order a takeaway.",
    "A confused alien visiting Earth.",
    "A very unusual family portrait.",
    "A robot attempting to make breakfast."
  ],
  who: [
    "Describe your perfect excuse for being late.",
    "What is an unusual thing you would keep in your pocket?",
    "Invent a completely unnecessary school subject.",
    "What would your warning label say?"
  ]
};

export function randomPrompt(mode) {
  const list = PROMPTS[mode] || PROMPTS.caption;
  return list[Math.floor(Math.random() * list.length)];
}
