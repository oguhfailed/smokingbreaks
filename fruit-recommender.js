#!/usr/bin/env node

// Nutrient data per average serving (one fruit)
// Sources: USDA FoodData Central
const fruits = {
  apple: {
    name: "Apple",
    emoji: "🍎",
    serving: "1 medium apple (~182g)",
    nutrients: {
      calories:       { value: 95,   unit: "kcal" },
      fiber:          { value: 4.4,  unit: "g"    },
      vitaminC:       { value: 8.4,  unit: "mg"   },
      potassium:      { value: 195,  unit: "mg"   },
      vitaminB6:      { value: 0.07, unit: "mg"   },
      magnesium:      { value: 9,    unit: "mg"   },
      sugar:          { value: 19,   unit: "g"    },
      antioxidants:   { value: 3,    unit: "score" }, // relative score 1-5
    },
    bestFor: "Gut health & antioxidants (quercetin, catechin)",
    tip: "Eat with skin on — most nutrients are in or near the skin.",
  },

  orange: {
    name: "Orange",
    emoji: "🍊",
    serving: "1 medium orange (~131g)",
    nutrients: {
      calories:       { value: 62,   unit: "kcal" },
      fiber:          { value: 3.1,  unit: "g"    },
      vitaminC:       { value: 70,   unit: "mg"   },
      potassium:      { value: 237,  unit: "mg"   },
      vitaminB6:      { value: 0.06, unit: "mg"   },
      magnesium:      { value: 13,   unit: "mg"   },
      sugar:          { value: 12,   unit: "g"    },
      antioxidants:   { value: 4,    unit: "score" },
    },
    bestFor: "Immune system — highest Vitamin C of the three",
    tip: "Eat the whole fruit rather than juice to keep the fiber.",
  },

  banana: {
    name: "Banana",
    emoji: "🍌",
    serving: "1 medium banana (~118g)",
    nutrients: {
      calories:       { value: 105,  unit: "kcal" },
      fiber:          { value: 3.1,  unit: "g"    },
      vitaminC:       { value: 10.3, unit: "mg"   },
      potassium:      { value: 422,  unit: "mg"   },
      vitaminB6:      { value: 0.43, unit: "mg"   },
      magnesium:      { value: 32,   unit: "mg"   },
      sugar:          { value: 14,   unit: "g"    },
      antioxidants:   { value: 2,    unit: "score" },
    },
    bestFor: "Energy & muscle function — highest potassium & B6",
    tip: "Slightly unripe bananas have more resistant starch (prebiotic).",
  },
};

// Daily focus: each day of the week highlights a different nutrient priority
const dailyFocus = [
  { day: "Sunday",    priority: "antioxidants", label: "Antioxidant boost"    },
  { day: "Monday",    priority: "vitaminC",     label: "Immune support"       },
  { day: "Tuesday",   priority: "potassium",    label: "Heart & muscle health" },
  { day: "Wednesday", priority: "fiber",        label: "Gut health"           },
  { day: "Thursday",  priority: "vitaminB6",    label: "Brain & energy"       },
  { day: "Friday",    priority: "magnesium",    label: "Recovery & relaxation" },
  { day: "Saturday",  priority: "calories",     label: "Quick energy"         },  // lowest = lightest day
];

// For calories we want the LOWEST (lightest snack on Saturday)
const lowerIsBetter = new Set(["calories", "sugar"]);

function pickBestFruit(priority) {
  let best = null;
  let bestValue = null;

  for (const [key, fruit] of Object.entries(fruits)) {
    const val = fruit.nutrients[priority].value;
    const isBetter = best === null ||
      (lowerIsBetter.has(priority) ? val < bestValue : val > bestValue);

    if (isBetter) {
      best = key;
      bestValue = val;
    }
  }
  return { key: best, fruit: fruits[best], value: bestValue };
}

function bar(value, max, width = 20) {
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function printNutrientComparison(priority) {
  const values = Object.entries(fruits).map(([, f]) => f.nutrients[priority].value);
  const max = Math.max(...values);

  console.log(`\n  Nutrient: ${priority.replace(/([A-Z])/g, " $1").trim()}`);
  console.log("  " + "─".repeat(48));

  for (const [, fruit] of Object.entries(fruits)) {
    const val = fruit.nutrients[priority].value;
    const unit = fruit.nutrients[priority].unit;
    const b = bar(val, max);
    const marker = lowerIsBetter.has(priority) && val === Math.min(...values) ? " ✓ best" :
                   !lowerIsBetter.has(priority) && val === max ? " ✓ best" : "";
    console.log(`  ${fruit.emoji} ${fruit.name.padEnd(7)} ${b} ${String(val).padStart(6)} ${unit}${marker}`);
  }
}

function run() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const focus = dailyFocus[dayOfWeek];
  const { fruit } = pickBestFruit(focus.priority);

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         🌿  Daily Fruit Nutrient Recommender         ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  📅  ${dateStr}`);
  console.log(`  🎯  Today's focus: ${focus.label}`);

  console.log("\n  ┌─────────────────────────────────────────────────┐");
  console.log(`  │  Today, eat a ${fruit.emoji}  ${fruit.name.toUpperCase().padEnd(35)} │`);
  console.log(`  │  Serving: ${fruit.serving.padEnd(42)} │`);
  console.log("  └─────────────────────────────────────────────────┘");

  console.log(`\n  Why? ${fruit.bestFor}`);
  console.log(`  Tip: ${fruit.tip}`);

  // Compare all 3 fruits on today's priority nutrient
  printNutrientComparison(focus.priority);

  // Full nutrient table for all three fruits
  console.log("\n  ── Full Nutrient Snapshot (per serving) ─────────────");
  const nutrientKeys = Object.keys(fruits.apple.nutrients);
  const header = "  Nutrient".padEnd(22) +
    "Apple".padEnd(14) + "Orange".padEnd(14) + "Banana";
  console.log(header);
  console.log("  " + "─".repeat(56));

  for (const nk of nutrientKeys) {
    const label = nk.replace(/([A-Z])/g, " $1").trim();
    const row = `  ${label.padEnd(20)}` +
      `${fruits.apple.nutrients[nk].value} ${fruits.apple.nutrients[nk].unit}`.padEnd(14) +
      `${fruits.orange.nutrients[nk].value} ${fruits.orange.nutrients[nk].unit}`.padEnd(14) +
      `${fruits.banana.nutrients[nk].value} ${fruits.banana.nutrients[nk].unit}`;
    console.log(row);
  }

  // Weekly schedule preview
  console.log("\n  ── This Week's Rotation ──────────────────────────────");
  for (const f of dailyFocus) {
    const { fruit: wFruit } = pickBestFruit(f.priority);
    const marker = f.day === focus.day ? " ◄ today" : "";
    console.log(`  ${f.day.padEnd(12)} ${wFruit.emoji} ${wFruit.name.padEnd(8)} — ${f.label}${marker}`);
  }

  console.log("\n");
}

run();
