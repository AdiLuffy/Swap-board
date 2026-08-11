import "dotenv/config";
import neo4j from "neo4j-driver";

const { COGNODB_URI, COGNODB_USER, COGNODB_PASSWORD } = process.env;

if (!COGNODB_URI || !COGNODB_USER || !COGNODB_PASSWORD) {
  console.error(
    "Missing COGNODB_URI / COGNODB_USER / COGNODB_PASSWORD. Copy .env.example to .env and fill in your CognoDB credentials first."
  );
  process.exit(1);
}

const driver = neo4j.driver(COGNODB_URI, neo4j.auth.basic(COGNODB_USER, COGNODB_PASSWORD));

const SKILLS = [
  ["Sourdough Baking", "Cooking"], ["Knife Sharpening", "Craft"], ["Watercolor Painting", "Art"],
  ["Guitar Lessons", "Music"], ["Piano Lessons", "Music"], ["Spanish Conversation", "Language"],
  ["Japanese Conversation", "Language"], ["Yoga Instruction", "Fitness"], ["Weight Training", "Fitness"],
  ["Bicycle Repair", "Craft"], ["Furniture Restoration", "Craft"], ["Pottery", "Art"],
  ["Web Development", "Tech"], ["Data Analysis (Python)", "Tech"], ["Photography", "Art"],
  ["Video Editing", "Tech"], ["Vegetable Gardening", "Gardening"], ["Beekeeping", "Gardening"],
  ["Tax Prep Basics", "Finance"], ["Budgeting Coaching", "Finance"], ["Knitting", "Craft"],
  ["Sewing & Alterations", "Craft"], ["Home Electrical Basics", "Craft"], ["Car Maintenance", "Craft"],
  ["French Conversation", "Language"], ["Public Speaking", "Life Skills"], ["Resume Coaching", "Life Skills"],
  ["Meditation", "Life Skills"], ["Chess", "Games"], ["Songwriting", "Music"],
];

const FIRST = ["Amara", "Liam", "Sofia", "Noah", "Priya", "Diego", "Elena", "Kenji", "Maya", "Tobias",
  "Zoe", "Omar", "Ines", "Felix", "Nadia", "Arjun", "Clara", "Marcus", "Yuki", "Leila",
  "Ravi", "Hannah", "Theo", "Isla", "Mateo", "Freya", "Idris", "Camille", "Anton", "Rosa"];
const LAST = ["Osei", "Fischer", "Rossi", "Nakamura", "Silva", "Novak", "Haddad", "Kaur", "Brandt", "Ibarra"];
const CITIES = ["Portland", "Austin", "Denver", "Raleigh", "Minneapolis", "Pittsburgh", "Boise", "Madison"];
const BIOS = [
  "Been doing this for years and love sharing it.",
  "Self-taught and always happy to swap notes.",
  "Teaching a couple evenings a week these days.",
  "New-ish to the neighborhood, excited to trade skills.",
  "Retired and finally has time to teach properly.",
  "Runs a small workshop out of the garage.",
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randN(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(randN(0, copy.length - 1), 1)[0]);
  return out;
}

async function run() {
  const session = driver.session();
  try {
    console.log("Verifying connectivity...");
    await driver.verifyConnectivity();

    console.log("Clearing existing demo data (Person/Skill nodes only)...");
    await session.run(`MATCH (n) WHERE n:Person OR n:Skill DETACH DELETE n`);

    console.log("Creating constraints & indexes...");
    await session.run(`CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE`);
    await session.run(`CREATE CONSTRAINT skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE`);
    await session.run(`CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.name)`);
    await session.run(`CREATE INDEX skill_name IF NOT EXISTS FOR (s:Skill) ON (s.name)`);

    console.log("Loading skills...");
    const skillRows = SKILLS.map(([name, category], i) => ({ id: `sk_${i + 1}`, name, category }));
    await session.run(
      `UNWIND $rows AS row CREATE (s:Skill {id: row.id, name: row.name, category: row.category})`,
      { rows: skillRows }
    );

    console.log("Loading people...");
    const peopleCount = 45;
    const peopleRows = Array.from({ length: peopleCount }, (_, i) => ({
      id: `p_${i + 1}`,
      name: `${rand(FIRST)} ${rand(LAST)}`,
      bio: rand(BIOS),
      location: rand(CITIES),
      joinedAt: new Date(Date.now() - randN(1, 400) * 86400000).toISOString().slice(0, 10),
    }));
    await session.run(
      `UNWIND $rows AS row CREATE (p:Person {id: row.id, name: row.name, bio: row.bio, location: row.location, joinedAt: row.joinedAt})`,
      { rows: peopleRows }
    );

    console.log("Wiring OFFERS / WANTS relationships...");
    const offerRows = [];
    const wantRows = [];
    const levels = ["beginner", "intermediate", "advanced", "expert"];
    for (const person of peopleRows) {
      const offered = sample(skillRows, randN(1, 3));
      const remaining = skillRows.filter((s) => !offered.includes(s));
      const wanted = sample(remaining, randN(1, 3));
      for (const s of offered) {
        offerRows.push({ personId: person.id, skillId: s.id, level: rand(levels), description: `Happy to teach ${s.name.toLowerCase()} one-on-one or in a small group.` });
      }
      for (const s of wanted) {
        wantRows.push({ personId: person.id, skillId: s.id, priority: randN(1, 3) });
      }
    }
    await session.run(
      `UNWIND $rows AS row
       MATCH (p:Person {id: row.personId}), (s:Skill {id: row.skillId})
       CREATE (p)-[:OFFERS {level: row.level, description: row.description}]->(s)`,
      { rows: offerRows }
    );
    await session.run(
      `UNWIND $rows AS row
       MATCH (p:Person {id: row.personId}), (s:Skill {id: row.skillId})
       CREATE (p)-[:WANTS {priority: row.priority}]->(s)`,
      { rows: wantRows }
    );

    // ---- Guarantee a few interesting matches for the demo ----------------
    console.log("Planting guaranteed direct match and swap cycles for the demo...");

    // Direct 1:1 match: p_1 offers Guitar, wants Spanish; p_2 offers Spanish, wants Guitar
    await session.run(`
      MATCH (a:Person {id:'p_1'}), (b:Person {id:'p_2'}),
            (guitar:Skill {name:'Guitar Lessons'}), (spanish:Skill {name:'Spanish Conversation'})
      MERGE (a)-[:OFFERS {level:'advanced', description:'20 years playing, happy to teach beginners.'}]->(guitar)
      MERGE (a)-[:WANTS {priority:1}]->(spanish)
      MERGE (b)-[:OFFERS {level:'intermediate', description:'Native speaker, patient with beginners.'}]->(spanish)
      MERGE (b)-[:WANTS {priority:1}]->(guitar)
    `);

    // 3-person cycle: p_3 -> p_4 -> p_5 -> p_3
    await session.run(`
      MATCH (a:Person {id:'p_3'}), (b:Person {id:'p_4'}), (c:Person {id:'p_5'}),
            (baking:Skill {name:'Sourdough Baking'}), (yoga:Skill {name:'Yoga Instruction'}), (web:Skill {name:'Web Development'})
      MERGE (a)-[:OFFERS {level:'expert', description:'Bake three loaves a week, love teaching technique.'}]->(baking)
      MERGE (a)-[:WANTS {priority:1}]->(web)
      MERGE (b)-[:OFFERS {level:'advanced', description:'Certified instructor, all levels welcome.'}]->(yoga)
      MERGE (b)-[:WANTS {priority:1}]->(baking)
      MERGE (c)-[:OFFERS {level:'expert', description:'Full-stack developer, can teach fundamentals.'}]->(web)
      MERGE (c)-[:WANTS {priority:1}]->(yoga)
    `);

    // 4-person cycle: p_6 -> p_7 -> p_8 -> p_9 -> p_6
    await session.run(`
      MATCH (a:Person {id:'p_6'}), (b:Person {id:'p_7'}), (c:Person {id:'p_8'}), (d:Person {id:'p_9'}),
            (pottery:Skill {name:'Pottery'}), (photo:Skill {name:'Photography'}),
            (french:Skill {name:'French Conversation'}), (bike:Skill {name:'Bicycle Repair'})
      MERGE (a)-[:OFFERS {level:'advanced', description:'Wheel-thrown pottery, small studio classes.'}]->(pottery)
      MERGE (a)-[:WANTS {priority:1}]->(photo)
      MERGE (b)-[:OFFERS {level:'expert', description:'Portrait and landscape work, happy to mentor.'}]->(photo)
      MERGE (b)-[:WANTS {priority:1}]->(french)
      MERGE (c)-[:OFFERS {level:'intermediate', description:'Lived in Lyon for 6 years.'}]->(french)
      MERGE (c)-[:WANTS {priority:1}]->(bike)
      MERGE (d)-[:OFFERS {level:'advanced', description:'Former bike shop mechanic.'}]->(bike)
      MERGE (d)-[:WANTS {priority:1}]->(pottery)
    `);

    const counts = await session.run(`
      MATCH (p:Person) WITH count(p) AS people
      MATCH (s:Skill) WITH people, count(s) AS skills
      MATCH ()-[o:OFFERS]->() WITH people, skills, count(o) AS offers
      MATCH ()-[w:WANTS]->() RETURN people, skills, offers, count(w) AS wants
    `);
    const c = counts.records[0];
    console.log(
      `Done. ${c.get("people")} people, ${c.get("skills")} skills, ${c.get("offers")} OFFERS, ${c.get("wants")} WANTS edges.`
    );
    console.log("Demo tip: try direct matches for p_1, and swap chains for p_3 and p_6.");
  } finally {
    await session.close();
    await driver.close();
  }
}

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
