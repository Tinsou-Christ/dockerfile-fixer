/**
 * Default question pack. Categories mirror the ones used by the quiz bot
 * command: general, anime, flag, torf (true/false) + extra topics.
 * Everything here is editable/removable from the admin panel.
 */
function q(category, difficulty, question, options, answerIndex, imageUrl = null) {
  return { category, difficulty, question, options, answerIndex, imageUrl };
}

const RAW = [
  // ---------------------------------------------------------------- general
  q("general", "easy", "What is the capital of Japan?", ["Osaka", "Tokyo", "Kyoto", "Nagoya"], 1),
  q("general", "easy", "How many continents are there on Earth?", ["5", "6", "7", "8"], 2),
  q("general", "medium", "Who wrote the play 'Romeo and Juliet'?", ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"], 1),
  q("general", "medium", "What is the largest ocean on Earth?", ["Atlantic", "Indian", "Arctic", "Pacific"], 3),
  q("general", "hard", "In which year did the Berlin Wall fall?", ["1987", "1989", "1991", "1993"], 1),
  q("general", "hard", "What is the currency of Switzerland?", ["Euro", "Swiss Franc", "Krone", "Schilling"], 1),

  // ---------------------------------------------------------------- science
  q("science", "easy", "What gas do plants absorb from the atmosphere?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], 2),
  q("science", "medium", "What is the chemical symbol for gold?", ["Go", "Gd", "Au", "Ag"], 2),
  q("science", "medium", "How many bones are in the adult human body?", ["186", "206", "226", "246"], 1),
  q("science", "hard", "What is the speed of light in a vacuum (approx.)?", ["150,000 km/s", "300,000 km/s", "450,000 km/s", "1,000,000 km/s"], 1),

  // ---------------------------------------------------------------- history
  q("history", "easy", "Who was the first President of the United States?", ["Abraham Lincoln", "Thomas Jefferson", "George Washington", "John Adams"], 2),
  q("history", "medium", "In which year did World War II end?", ["1943", "1944", "1945", "1946"], 2),
  q("history", "hard", "Which empire was ruled by Mansa Musa?", ["Roman Empire", "Mali Empire", "Ottoman Empire", "Mongol Empire"], 1),

  // -------------------------------------------------------------- geography
  q("geography", "easy", "Which is the longest river in Africa?", ["Congo", "Niger", "Nile", "Zambezi"], 2),
  q("geography", "medium", "Mount Everest is located in which mountain range?", ["Andes", "Alps", "Himalayas", "Rockies"], 2),
  q("geography", "hard", "Which country has the most time zones?", ["Russia", "USA", "France", "China"], 2),

  // ----------------------------------------------------------------- sports
  q("sports", "easy", "How many players are on a football (soccer) team on the pitch?", ["9", "10", "11", "12"], 2),
  q("sports", "medium", "Which country won the 2018 FIFA World Cup?", ["Brazil", "Germany", "France", "Croatia"], 2),
  q("sports", "hard", "How many Grand Slam singles titles had Serena Williams won?", ["18", "21", "23", "25"], 2),

  // ------------------------------------------------------------------ music
  q("music", "easy", "How many strings does a standard guitar have?", ["4", "5", "6", "7"], 2),
  q("music", "medium", "Who is known as the 'King of Pop'?", ["Elvis Presley", "Michael Jackson", "Prince", "James Brown"], 1),

  // ----------------------------------------------------------------- movies
  q("movies", "easy", "Which movie features the character Simba?", ["Tarzan", "The Lion King", "Madagascar", "Bambi"], 1),
  q("movies", "medium", "Who directed the movie 'Inception'?", ["Steven Spielberg", "Christopher Nolan", "James Cameron", "Ridley Scott"], 1),

  // ------------------------------------------------------------------ anime
  q("anime", "easy", "Which pirate wears a straw hat and wants to be King of the Pirates?", ["Zoro", "Luffy", "Sanji", "Ace"], 1,
    "https://upload.wikimedia.org/wikipedia/en/9/90/One_Piece%2C_Volume_61_Cover_%28Japanese%29.jpg"),
  q("anime", "medium", "This ninja dreams of becoming Hokage.", ["Sasuke", "Naruto", "Kakashi", "Gaara"], 1,
    "https://upload.wikimedia.org/wikipedia/en/9/94/NarutoCoverTankobon1.jpg"),
  q("anime", "medium", "He is a Titan-slaying soldier from the Survey Corps.", ["Levi", "Eren", "Armin", "Jean"], 1,
    "https://upload.wikimedia.org/wikipedia/en/d/d6/Shingeki_no_Kyojin_manga_volume_1.jpg"),
  q("anime", "hard", "This alchemist lost his arm and leg in a failed human transmutation.", ["Alphonse Elric", "Edward Elric", "Roy Mustang", "Ling Yao"], 1,
    "https://upload.wikimedia.org/wikipedia/en/9/91/Fullmetal_Alchemist_-_Volume_1_%28Viz%29.png"),

  // ------------------------------------------------------------------- flag
  q("flag", "easy", "Guess this country's flag", ["Japan", "China", "South Korea", "Vietnam"], 0,
    "https://flagcdn.com/w640/jp.png"),
  q("flag", "easy", "Guess this country's flag", ["Italy", "Ireland", "Mexico", "Hungary"], 0,
    "https://flagcdn.com/w640/it.png"),
  q("flag", "medium", "Guess this country's flag", ["Senegal", "Ghana", "Cameroon", "Mali"], 2,
    "https://flagcdn.com/w640/cm.png"),
  q("flag", "medium", "Guess this country's flag", ["Chile", "Cuba", "Puerto Rico", "Texas"], 0,
    "https://flagcdn.com/w640/cl.png"),
  q("flag", "hard", "Guess this country's flag", ["Chad", "Romania", "Andorra", "Moldova"], 1,
    "https://flagcdn.com/w640/ro.png"),

  // --------------------------------------------------------- true or false
  q("torf", "easy", "The Great Wall of China is visible from space with the naked eye.", ["True", "False"], 1),
  q("torf", "easy", "Water boils at 100°C at sea level.", ["True", "False"], 0),
  q("torf", "medium", "Bananas are technically berries.", ["True", "False"], 0),
  q("torf", "medium", "Lightning never strikes the same place twice.", ["True", "False"], 1),
  q("torf", "hard", "Octopuses have three hearts.", ["True", "False"], 0),
];

function seedQuestions() {
  const now = new Date().toISOString();
  return RAW.map((item, i) => ({
    _id: (Date.now().toString(16) + i.toString(16).padStart(6, "0")).padEnd(24, "0").slice(0, 24),
    category: item.category,
    difficulty: item.difficulty,
    question: item.question,
    options: item.options,
    answerIndex: item.answerIndex,
    imageUrl: item.imageUrl || null,
    stats: { asked: 0, correct: 0 },
    createdAt: now,
    updatedAt: now,
  }));
}

module.exports = { seedQuestions };
