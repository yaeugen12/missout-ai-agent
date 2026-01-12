# 🔧 FIX: Upload Avatars to Google Cloud Storage

## Problema Identificată

**Avatarurile arată doar 2 litere (BF, VI, etc.) în:**
- ❌ Leaderboard
- ❌ Profile
- ❌ Participants list

**Root Cause:**
```
curl -I https://missout.onrender.com/uploads/9765e58cedf4be091e6d184d282830ad.png
→ HTTP/1.1 404 Not Found
```

**Fișierele nu există pe server** pentru că:
1. Upload-ul salvează în `/uploads` local (ephemeral filesystem)
2. **Render șterge toate fișierele la fiecare redeploy**!
3. Google Cloud Storage este configurat DAR nu este folosit

**De ce funcționează în Edit Profile și Orbiting Avatars:**
- Acestea folosesc Dicebear (generated avatars) ca fallback
- Sau cache-ul browser-ului păstrează temporar imaginea

---

## Soluție: Upload la Google Cloud Storage

### Modificări în `server/src/routes.ts`

**1. Adaugă import** (după linia 31):
```typescript
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage.js";
```

**2. Înlocuiește `/api/upload` endpoint** (liniile 169-182):

```typescript
// ÎNAINTE (salvează local - se pierde la redeploy):
const publicUrl = `/uploads/${req.file.filename}`;
console.log("[UPLOAD] Accepted file:", req.file.filename);
res.json({ url: publicUrl });
```

```typescript
// DUPĂ (salvează în Google Cloud Storage - persistent):
try {
  // Upload to Google Cloud Storage for persistence across deployments
  const bucket = objectStorageClient.bucket(process.env.GCLOUD_BUCKET || 'missout-storage');
  const gcsFileName = `avatars/${req.file.filename}`;
  const file = bucket.file(gcsFileName);

  // Upload the file to GCS
  await file.save(await fs.readFile(req.file.path), {
    contentType: req.file.mimetype,
    public: true, // Make file publicly accessible
    metadata: {
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    },
  });

  // Get public URL
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${gcsFileName}`;

  // Delete local temp file
  await fs.unlink(req.file.path);

  console.log("[UPLOAD] File uploaded to GCS:", publicUrl);
  res.json({ url: publicUrl });
} catch (error: any) {
  console.error("[UPLOAD] Failed to upload to GCS:", error);
  // Fallback to local storage (will be lost on redeploy)
  const publicUrl = `/uploads/${req.file.filename}`;
  console.log("[UPLOAD] Using local storage fallback:", publicUrl);
  res.json({ url: publicUrl });
}
```

---

## Ce Face Acest Fix

### Înainte:
1. Upload → Salvează în `/uploads/abc.png` (local disk)
2. Backend returnează: `/uploads/abc.png`
3. Frontend construiește: `https://missout.onrender.com/uploads/abc.png`
4. **Redeploy → Fișierul dispare** ❌
5. Request → 404 Not Found
6. Avatar arată fallback: "BF" (primele 2 litere)

### După:
1. Upload → Salvează în Google Cloud Storage
2. Backend returnează: `https://storage.googleapis.com/missout-storage/avatars/abc.png`
3. Frontend folosește direct URL-ul GCS
4. **Redeploy → Fișierul RĂMÂNE în GCS** ✅
5. Request → 200 OK (imaginea există permanent)
6. Avatar arată logo-ul real! ✅

---

## Environment Variables Necesare (Deja Configurate)

În Render, verifică că acestea sunt setate:

```env
✅ GCLOUD_BUCKET=missout-storage
✅ GCLOUD_PROJECT_ID=missout
✅ GCLOUD_SERVICE_ACCOUNT=missout-storage@missout.iam.gserviceaccount.com
✅ GOOGLE_APPLICATION_CREDENTIALS_JSON=<service-account-json>
```

**Sunt deja configurate din sesiunea anterioară!** ✅

---

## File Complet: `server/src/routes.ts` - Upload Endpoint

Înlocuiește endpoint-ul `/api/upload` (începând de la linia 163) cu:

```typescript
// Upload Endpoint with security validation + strict rate limiting (10 uploads per 5 minutes)
app.post("/api/upload", strictLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // SECURITY: Validate actual file content matches claimed mime type
  const isValidContent = await validateImageContent(req.file.path, req.file.mimetype);
  if (!isValidContent) {
    // Delete the invalid file
    try {
      await fs.unlink(req.file.path);
    } catch {}
    console.log("[SECURITY] Rejected upload - content does not match mime type");
    return res.status(400).json({ message: "Invalid file content. File does not appear to be a valid image." });
  }

  try {
    // Upload to Google Cloud Storage for persistence across deployments
    const bucket = objectStorageClient.bucket(process.env.GCLOUD_BUCKET || 'missout-storage');
    const gcsFileName = `avatars/${req.file.filename}`;
    const file = bucket.file(gcsFileName);

    // Upload the file to GCS
    await file.save(await fs.readFile(req.file.path), {
      contentType: req.file.mimetype,
      public: true, // Make file publicly accessible
      metadata: {
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${gcsFileName}`;

    // Delete local temp file
    await fs.unlink(req.file.path);

    console.log("[UPLOAD] File uploaded to GCS:", publicUrl);
    res.json({ url: publicUrl });
  } catch (error: any) {
    console.error("[UPLOAD] Failed to upload to GCS:", error);
    // Fallback to local storage (will be lost on redeploy)
    const publicUrl = `/uploads/${req.file.filename}`;
    console.log("[UPLOAD] Using local storage fallback:", publicUrl);
    res.json({ url: publicUrl });
  }
});
```

---

## Testing După Deploy

### 1. Upload New Avatar
1. Go to Profile Settings
2. Upload new logo
3. Check console - should see:
   ```
   [UPLOAD] File uploaded to GCS: https://storage.googleapis.com/missout-storage/avatars/...
   ```

### 2. Verify URL in Database
```bash
curl https://missout.onrender.com/api/profile/YOUR_WALLET

# Should return:
{
  "avatarUrl": "https://storage.googleapis.com/missout-storage/avatars/abc123.png",
  "displayAvatar": "https://storage.googleapis.com/missout-storage/avatars/abc123.png"
}
```

### 3. Test Image Access
```bash
curl -I https://storage.googleapis.com/missout-storage/avatars/abc123.png

# Should return:
HTTP/2 200 OK
content-type: image/png
```

### 4. Verify Avatar Display
- ✅ Leaderboard - shows logo (not "BF")
- ✅ Profile - shows logo
- ✅ Participants list - shows logo
- ✅ Navbar - shows logo
- ✅ **Survives redeploys!**

---

## Deployment Steps

1. **Apply fix** in `server/src/routes.ts`
2. **Commit & push**:
   ```bash
   git add server/src/routes.ts
   git commit -m "Fix: Upload avatars to Google Cloud Storage for persistence"
   git push
   ```
3. **Render redeploys automatically** ✅
4. **Test upload** - upload new avatar
5. **Verify** - logo shows everywhere!

---

## Why This Works

**Google Cloud Storage**:
- ✅ Persistent across redeploys
- ✅ Publicly accessible URLs
- ✅ CDN-backed (fast loading)
- ✅ Automatic scaling
- ✅ Already configured and paid for

**Benefits**:
- No more lost avatars after redeploy
- Permanent URLs
- Better performance (GCS CDN vs Render static)
- Professional solution

---

## 🎉 Result

După acest fix:
- **Avatarele vor funcționa PESTE TOT** ✅
- **Nu se vor mai pierde la redeploy** ✅
- **URL-uri permanente din GCS** ✅
- **Nu mai vezi "BF", "VI", etc. - vezi logo-ul real!** ✅
