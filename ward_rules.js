// Ward Rules - Behavioral Compliance Checker
// Stay out of the wards by following the rules.

const patients = [
  { name: "Alice",   behavesWell: true,  mindfulWithWords: true,  goodToWomen: true,  drinksCaffeine: false, isDickhead: false },
  { name: "Bob",     behavesWell: false, mindfulWithWords: true,  goodToWomen: true,  drinksCaffeine: false, isDickhead: false },
  { name: "Charlie", behavesWell: false, mindfulWithWords: false, goodToWomen: true,  drinksCaffeine: false, isDickhead: false },
  { name: "Dave",    behavesWell: true,  mindfulWithWords: true,  goodToWomen: false, drinksCaffeine: true,  isDickhead: false },
  { name: "Eve",     behavesWell: true,  mindfulWithWords: true,  goodToWomen: true,  drinksCaffeine: true,  isDickhead: false },
  { name: "Frank",   behavesWell: false, mindfulWithWords: false, goodToWomen: false, drinksCaffeine: true,  isDickhead: true  },
];

for (const person of patients) {
  console.log(`\n--- Evaluating: ${person.name} ---`);

  // Rule 1: Behave well with others, else be mindful with words, else Ward 3
  if (person.behavesWell) {
    console.log(`${person.name} behaves well with others. Good.`);
  } else if (person.mindfulWithWords) {
    console.log(`${person.name} is mindful with words. Acceptable.`);
  } else {
    console.log(`${person.name} → WARD 3. Neither behaves well nor mindful with words.`);
    continue; // Skip further checks — already heading to Ward 3
  }

  // Rule 2: Be good to women AND no caffeine, else Ward 5
  if (person.goodToWomen && !person.drinksCaffeine) {
    console.log(`${person.name} is good to women and caffeine-free. Staying clean.`);
  } else {
    console.log(`${person.name} → WARD 5. Failed the women/caffeine test.`);
    continue; // Skip further checks — heading to Ward 5
  }

  // Rule 3: Be a dickhead and never leave
  if (person.isDickhead) {
    console.log(`${person.name} is a dickhead. Never leaving this place. Ever.`);
  } else {
    console.log(`${person.name} is free to go. All rules passed!`);
  }
}
