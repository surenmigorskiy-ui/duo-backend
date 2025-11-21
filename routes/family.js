// C:/duo-backend/routes/family.js (ЧИСТАЯ ВЕРСИЯ БЕЗ КОММЕНТАРИЕВ)

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const auth = require('../middleware/authMiddleware');

router.get('/members', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const usersSnap = await db.collection('users').where('familyId', '==', familyId).get();
    
    if (usersSnap.empty) {
      return res.status(200).json([]);
    }

    const members = usersSnap.docs.map(doc => {
        const { password, ...userData } = doc.data(); 
        return userData;
    });

    res.status(200).json(members);
  } catch (error) {
    console.error('[GET /members] Error:', error);
    res.status(500).json({ error: 'Failed to get family members' });
  }
});

router.get('/data', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const familyDoc = await db.collection('families').doc(familyId).get();

    if (!familyDoc.exists) {
      return res.status(200).json({});
    }

    res.status(200).json(familyDoc.data());
  } catch (error) {
    console.error('[GET /data] Error:', error);
    res.status(500).json({ error: 'Failed to get family data' });
  }
});

router.put('/data', auth, async (req, res) => {
  try {
    const { familyId } = req.user;
    const dataToSave = req.body;

    await db.collection('families').doc(familyId).set(dataToSave, { merge: true });
    res.status(200).json({ success: true, message: 'Data saved successfully' });
  } catch (error) {
    console.error('[PUT /data] Error:', error);
    res.status(500).json({ error: 'Failed to save family data' });
  }
});

router.delete('/data', auth, async (req, res) => {
    try {
        const { familyId } = req.user;
        await db.collection('families').doc(familyId).set({
            createdAt: new Date()
        });
        res.status(200).json({ success: true, message: 'Family data reset' });
    } catch (error) {
        console.error('[DELETE /data] Error:', error);
        res.status(500).json({ error: 'Failed to reset data' });
    }
});

router.post('/invitation', auth, async (req, res) => {
    try {
        const { familyId } = req.user;
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.collection('families').doc(familyId).update({
            inviteCode,
            inviteCodeExpiresAt: expiresAt,
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const inviteLink = `${frontendUrl}/join?code=${inviteCode}`;

        res.json({ inviteLink });

    } catch (error) {
        console.error("Invitation creation error:", error);
        res.status(500).json({ error: 'Failed to create invitation' });
    }
});

router.post('/join', auth, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        const userToJoinId = req.user.id;

        if (!inviteCode) {
            return res.status(400).json({ error: 'Invite code not provided' });
        }

        const familySnap = await db.collection('families').where('inviteCode', '==', inviteCode.toUpperCase()).limit(1).get();

        if (familySnap.empty) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        const familyDoc = familySnap.docs[0];
        const familyData = familyDoc.data();

        if (familyData.inviteCodeExpiresAt && familyData.inviteCodeExpiresAt.toDate() < new Date()) {
            return res.status(400).json({ error: 'Invite code expired' });
        }

        const targetFamilyId = familyDoc.id;

        await db.collection('users').doc(userToJoinId).update({
            familyId: targetFamilyId,
        });
        
        res.json({ success: true, message: 'Successfully joined the family!' });

    } catch (error) {
        console.error("Join family error:", error);
        res.status(500).json({ error: 'Failed to join family' });
    }
});

module.exports = router;