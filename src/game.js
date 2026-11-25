export const GAME_MODES = [
  {
    id: "caption",
    name: "Caption Chaos",
    description: "Come up with the funniest caption for a picture.",
    icon: "📸",
  },
  {
    id: "fill",
    name: "Fill the Gap",
    description: "Complete a sentence with the funniest answer.",
    icon: "✏️",
  },
  {
    id: "worst",
    name: "Worst Answer",
    description: "Give the most ridiculous answer possible.",
    icon: "🤡",
  },
  {
    id: "fake",
    name: "Fake It",
    description: "Make up an answer and see who can spot the truth.",
    icon: "🕵️",
  },
  {
    id: "picture",
    name: "Picture Perfect",
    description: "Draw something and let everyone guess what it is.",
    icon: "🎨",
  },
  {
    id: "telephone",
    name: "Drawing Telephone",
    description: "Pass drawings and guesses around the group.",
    icon: "☎️",
  },
  {
    id: "who",
    name: "Who Said That?",
    description: "Guess which player submitted each answer.",
    icon: "👀",
  },
];

export const PROMPTS = {
  caption: [
    "Caption this: a cat sitting like it owns the house.",
    "Caption this: someone running away from a tiny dog.",
    "Caption this: a penguin standing in the middle of a road.",
    "Caption this: a person staring at an empty fridge.",
  ],

  fill: [
    "The worst thing to say during a job interview is...",
    "My secret talent is...",
    "The strangest thing to find in a school bag is...",
    "I knew it was going to be a bad day when...",
    "The world's least useful invention is...",
  ],

  worst: [
    "Invent a terrible name for a superhero.",
    "What should never be served at a restaurant?",
    "What is the worst possible birthday present?",
    "Invent a new school subject nobody would enjoy.",
  ],

  fake: [
    "Invent a fake animal and describe what it does.",
    "Make up a ridiculous historical event.",
    "Invent a completely unnecessary household appliance.",
  ],

  picture: [
    "Draw a dinosaur on holiday.",
    "Draw a very confused robot.",
    "Draw an animal wearing a hat.",
    "Draw a spaceship made of food.",
  ],

  telephone: [
    "A penguin riding a bicycle.",
    "A giant sandwich taking over a city.",
    "A dragon trying to use a computer.",
  ],

  who: [
    "What is the strangest thing you have ever eaten?",
    "What would you do if you became famous?",
    "What is the most unusual thing you own?",
  ],
};

export function getRandomPrompt(mode) {
  const prompts = PROMPTS[mode] || PROMPTS.fill;
  return prompts[Math.floor(Math.random() * prompts.length)];
}

export function createRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 5; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

export function shuffleArray(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}
