#!/usr/bin/env node

/**
 * Script helper pentru a obține service account JSON pentru deployment
 *
 * Folosire:
 *   node scripts/get-service-account-json.js
 *
 * Output: JSON minificat pe o singură linie, gata de copiat în Render env vars
 */

const fs = require('fs');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', 'config', 'service-account.json');

try {
  // Verifică dacă fișierul există
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Eroare: Fișierul service-account.json nu există!');
    console.error(`   Path așteptat: ${SERVICE_ACCOUNT_PATH}`);
    console.error('\n💡 Urmează pașii din GOOGLE_CLOUD_SETUP.md pentru a crea fișierul.');
    process.exit(1);
  }

  // Citește și parsează JSON-ul
  const serviceAccountContent = fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8');
  const serviceAccount = JSON.parse(serviceAccountContent);

  // Validează că are câmpurile necesare
  const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
  const missingFields = requiredFields.filter(field => !serviceAccount[field]);

  if (missingFields.length > 0) {
    console.error('❌ Eroare: Lipsesc câmpuri obligatorii din service-account.json:');
    missingFields.forEach(field => console.error(`   - ${field}`));
    process.exit(1);
  }

  // Minifică JSON-ul (pe o singură linie)
  const minifiedJson = JSON.stringify(serviceAccount);

  console.log('\n✅ Service account JSON găsit și validat!\n');
  console.log('📋 Copiază următorul JSON în Render Environment Variables:\n');
  console.log('━'.repeat(80));
  console.log(minifiedJson);
  console.log('━'.repeat(80));
  console.log('\n📝 Pași pentru Render:');
  console.log('   1. Mergi la Render Dashboard → serviciul tău backend');
  console.log('   2. Settings → Environment');
  console.log('   3. Add Environment Variable:');
  console.log('      Key: GOOGLE_APPLICATION_CREDENTIALS_JSON');
  console.log('      Value: [paste JSON-ul de mai sus]');
  console.log('   4. Save Changes\n');

  console.log('ℹ️  Info service account:');
  console.log(`   Project ID: ${serviceAccount.project_id}`);
  console.log(`   Client Email: ${serviceAccount.client_email}`);
  console.log(`   Private Key ID: ${serviceAccount.private_key_id}`);
  console.log('');

} catch (error) {
  if (error instanceof SyntaxError) {
    console.error('❌ Eroare: service-account.json nu este un JSON valid!');
    console.error('   Verifică că ai copiat corect conținutul din Google Cloud Console.');
  } else {
    console.error('❌ Eroare neprevăzută:', error.message);
  }
  process.exit(1);
}
