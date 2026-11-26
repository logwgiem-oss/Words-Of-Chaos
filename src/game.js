// WORDS OF CHAOS — GAME MODES

export const MODES = [
  {
    id: "caption",
    name: "Caption Chaos",
    icon: "💬",
    desc: "Give the picture your funniest caption.",
    kind: "text"
  },
  {
    id: "gap",
    name: "Fill the Gap",
    icon: "🧩",
    desc: "Finish the sentence in the most unexpected way.",
    kind: "text"
  },
  {
    id: "worst",
    name: "Worst Answer",
    icon: "🙃",
    desc: "Give the worst possible answer.",
    kind: "text"
  },
  {
    id: "fake",
    name: "Fake It",
    icon: "🕵️",
    desc: "Invent a convincing answer and fool the other players.",
    kind: "text"
  },
  {
    id: "picture",
    name: "Picture Perfect",
    icon: "🎨",
    desc: "Draw the prompt and let everyone judge your masterpiece.",
    kind: "draw"
  },
  {
    id: "telephone",
    name: "Drawing Telephone",
    icon: "📞",
    desc: "Turn a phrase into a drawing.",
    kind: "draw"
  },
  {
    id: "who",
    name: "Who Said That?",
    icon: "🗣️",
    desc: "Guess which player wrote each anonymous answer.",
    kind: "text"
  }
];

// PROMPTS FOR EACH MODE

export const PROMPTS = {
  caption: [
    "A penguin confidently entering a job interview.",
    "A dog who has just discovered online shopping.",
    "The world's least helpful superhero.",
    "A wizard having a very ordinary Tuesday.",
    "A cat pretending it pays the rent.",
    "Someone realising they have waved at the wrong person.",
    "A dinosaur trying to use a self-checkout.",
    "A robot experiencing its first birthday party.",
    "A seagull stealing someone's lunch.",
    "A llama who has had enough of everyone's nonsense."
  ],

  gap: [
    "The secret ingredient in every great sandwich is ____.",
    "Nobody expected the school trip to include ____.",
    "The worst thing to hear from a tour guide is ____.",
    "My new invention replaces ____ with ____.",
    "The one thing you should never put in a birthday cake is ____.",
    "The world's strangest new sport involves ____.",
    "I knew it was going to be a bad day when ____.",
    "The secret reason cats stare at walls is ____.",
    "The first rule of being a wizard is ____.",
    "Never trust anyone who carries ____."
  ],

  worst: [
    "Give the worst possible name for a luxury hotel.",
    "What should you absolutely not bring to a picnic?",
    "Invent a terrible slogan for a toothpaste brand.",
    "What is the least useful superpower?",
    "What is the worst possible birthday present?",
    "Name a restaurant that nobody would want to visit.",
    "What should never be included in a school lunch?",
    "Invent the worst possible theme park attraction.",
    "What is the least convincing excuse for being late?",
    "What would make a terrible name for a pet?"
  ],

  fake: [
    "What does the word 'petrichor' mean?",
    "Which planet has the shortest day?",
    "What is the collective noun for a group of flamingos?",
    "Which animal can sleep standing up?",
    "What is the name for a baby hedgehog?",
    "Which sea creature has three hearts?",
    "What is the fear of long words called?",
    "Which bird is famous for mimicking sounds?",
    "What is the largest species of penguin?",
    "Which animal has fingerprints surprisingly similar to humans?"
  ],

  picture: [
    "A dragon trying to ride a bicycle.",
    "A very suspicious-looking sandwich.",
    "An alien's first day at the beach.",
    "A robot walking a tiny dog.",
    "A penguin running a pizza restaurant.",
    "A castle built entirely out of cheese.",
    "A superhero whose only power is sneezing.",
    "A dinosaur attempting to do yoga.",
    "A fish driving a tiny submarine.",
    "A giant octopus playing the drums."
  ],

  telephone: [
    "A giraffe stuck in a lift.",
    "A pirate ordering a cup of tea.",
    "A spaceship made of cheese.",
    "A dinosaur doing the washing-up.",
    "A unicorn working in a supermarket.",
    "A chicken flying a hot-air balloon.",
    "A robot trying to bake a cake.",
    "A crocodile wearing roller skates.",
    "A squirrel opening a detective agency.",
    "A yeti building a snowman."
  ],

  who: [
    "What would be a terrible thing to say at a birthday party?",
    "Invent a new holiday and explain its tradition.",
    "What is the most suspicious thing a cat could say?",
    "Give a motivational speech to a potato.",
    "What would your fridge say about you?",
    "Invent a completely unnecessary school subject.",
    "What would be the worst thing to find in your shoes?",
    "Give a name to a very dramatic goldfish.",
    "What is the strangest thing to put on a pizza?",
    "What would aliens find most confusing about humans?"
  ]
};

// REAL ANSWERS FOR FAKE IT

export const REAL_FAKE = [
  {
    q: "What does 'petrichor' mean?",
    a: "The earthy smell after rain."
  },
  {
    q: "Which planet has the shortest day?",
    a: "Jupiter."
  },
  {
    q: "What is a group of flamingos called?",
    a: "A flamboyance."
  },
  {
    q: "Which animal can sleep standing up?",
    a: "A horse."
  },
  {
    q: "What is a baby hedgehog called?",
    a: "A hoglet."
  },
  {
    q: "Which sea creature has three hearts?",
    a: "An octopus."
  },
  {
    q: "What is the fear of long words called?",
    a: "Hippopotomonstrosesquipedaliophobia."
  }
];

// RANDOM PROMPT PICKER

export function pick(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Invent the funniest answer you can.";
  }

  return items[Math.floor(Math.random() * items.length)];
}

// ROOM CODE GENERATOR

export function makeCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 4; i++) {
    code += characters[
      Math.floor(Math.random() * characters.length)
    ];
  }

  return code;
}
