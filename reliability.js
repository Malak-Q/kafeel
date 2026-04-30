const express = require('express');
const router = express.Router();
const ReliabilityIndex = require('../models/ReliabilityIndex');
const auth = require('../middleware/auth');

// Get user's reliability score
router.get('/score/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user can only access their own score
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const scoreData = await ReliabilityIndex.calculateReliabilityScore(userId);
    
    res.json({
      success: true,
      data: scoreData
    });

  } catch (error) {
    console.error('Error getting reliability score:', error);
    res.status(500).json({ 
      error: 'Failed to calculate reliability score',
      message: error.message 
    });
  }
});

// Get reliability score history
router.get('/history/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const db = require('../database/connection');
    const history = await db('reliability_scores')
      .where('user_id', userId)
      .orderBy('calculated_at', 'desc')
      .limit(12);

    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Error getting reliability history:', error);
    res.status(500).json({ 
      error: 'Failed to get reliability history',
      message: error.message 
    });
  }
});

// Get market reliability statistics (admin only)
router.get('/market-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const db = require('../database/connection');
    
    const stats = await db('reliability_scores')
      .select(
        db.raw('AVG(bayesian_score) as average_score'),
        db.raw('COUNT(*) as total_users'),
        db.raw('AVG(confidence_level) as average_confidence')
      )
      .where('calculated_at', '>=', db.raw('NOW() - INTERVAL \'30 days\''))
      .first();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error getting market stats:', error);
    res.status(500).json({ 
      error: 'Failed to get market statistics',
      message: error.message 
    });
  }
});

module.exports = router;
