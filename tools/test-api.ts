import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const API_URL = 'http://localhost:3000/v1/render';

function generateString(length: number) {
  const words = ['Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'Nurse', 'Hospital', 'Care', 'Health', 'Available'];
  let result = '';
  while (result.length < length) {
    const word = words[Math.floor(Math.random() * words.length)];
    if (result.length + word.length + 1 > length) {
      result += 'x'.repeat(length - result.length);
    } else {
      result += (result ? ' ' : '') + word;
    }
  }
  return result;
}

const templatesDir = path.resolve(process.cwd(), 'templates');
const templates = readdirSync(templatesDir).filter(name => {
  return existsSync(path.join(templatesDir, name, 'schema.json'));
});

async function runTests() {
  console.log('Starting API Load & Constraint Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const template of templates) {
    const schemaPath = path.resolve(process.cwd(), 'templates', template, 'schema.json');
    if (!existsSync(schemaPath)) continue;
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    
    console.log(`\n=== Testing Template: ${template} ===`);
    
    // Test Case 1: All extremely short strings
    const shortData: Record<string, string> = {};
    for (const field of schema.fields) {
      shortData[field.id] = field.id.toUpperCase();
    }
    await sendTest(`[${template}] Short text`, template, shortData, 200);

    // Test Case 2: All max length strings
    const maxData: Record<string, string> = {};
    for (const field of schema.fields) {
      maxData[field.id] = generateString(field.maxChars || 20);
    }
    // Note: Max data might trigger a 422 if the generated text wraps poorly and exceeds maxLines
    await sendTest(`[${template}] Max character limits`, template, maxData, [200, 422]);
    
    // Test Case 3: Missing required fields
    const reqField = schema.fields.find((f: any) => f.required);
    if (reqField) {
      const missingData = { ...shortData };
      delete missingData[reqField.id];
      await sendTest(`[${template}] Missing required field (${reqField.id})`, template, missingData, 400);
    }
    
    // Test Cases 4-15: Random variations
    for (let i = 0; i < 12; i++) {
      const randomData: Record<string, string> = {};
      for (const field of schema.fields) {
        // Random length between 5 and maxChars
        const len = Math.floor(Math.random() * ((field.maxChars || 20) - 5)) + 5;
        randomData[field.id] = generateString(len);
      }
      // Running these in parallel to also test the Semaphore queuing
      sendTest(`[${template}] Random variant ${i + 1}`, template, randomData, [200, 422]).then(res => {
        if (res) passed++; else failed++;
      });
    }
  }
  
  // Wait a bit for parallel requests to drain
  setTimeout(() => {
    console.log(`\nTest Run Complete: ${passed} passed, ${failed} failed.`);
  }, 20000); // 20s timeout for all queued renders
  
  async function sendTest(name: string, template: string, data: any, expectedStatus: number | number[]): Promise<boolean> {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, data })
      });
      const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      
      if (expected.includes(res.status)) {
        console.log(`✅ PASS: ${name} (Status: ${res.status})`);
        return true;
      } else {
        const err = await res.text();
        console.error(`❌ FAIL: ${name} (Expected ${expected.join(' or ')}, got ${res.status}). Response: ${err}`);
        return false;
      }
    } catch (e: any) {
      console.error(`❌ FAIL: ${name} - Network Error: ${e.message}`);
      return false;
    }
  }
}

runTests();
