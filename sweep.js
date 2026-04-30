const express = require('express');
const router = express.Router();
const Joi = require('joi');
const SalaryDaySweep = require('../models/SalaryDaySweep');
const auth = require('../middleware/auth');

// Validation schemas
const sweepConfigSchema = Joi.object({
  sweep_percentage: Joi.number().min(1).max(100).precision(2).required().messages({
    'number.min': 'Sweep percentage must be at least 1%',
    'number.max': 'Sweep percentage cannot exceed 100%',
    'any.required': 'Sweep percentage is required'
  }),
  minimum_sweep_amount: Joi.number().positive().precision(3).required().messages({
    'number.positive': 'Minimum sweep amount must be positive',
    'any.required': 'Minimum sweep amount is required'
  }),
  maximum_sweep_amount: Joi.number().positive().precision(3).optional(),
  sweep_frequency: Joi.string().valid('monthly', 'bi_weekly').default('monthly'),
  sweep_day_before_salary: Joi.number().integer().min(1).max(30).default(3),
  salary_day: Joi.number().integer().min(1).max(31).required()
});

const updateSweepConfigSchema = Joi.object({
  sweep_percentage: Joi.number().min(1).max(100).precision(2).optional(),
  minimum_sweep_amount: Joi.number().positive().precision(3).optional(),
  maximum_sweep_amount: Joi.number().positive().precision(3).optional(),
  sweep_frequency: Joi.string().valid('monthly', 'bi_weekly').optional(),
  sweep_day_before_salary: Joi.number().integer().min(1).max(30).optional(),
  is_active: Joi.boolean().optional()
});

// Create sweep configuration
router.post('/configure', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Validate request body
    const { error, value } = sweepConfigSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    // Liquidity Shield check - ensure user has sufficient income stability
    const liquidityCheck = await SalaryDaySweep.performLiquidityShield(userId, value);
    if (!liquidityCheck.passed) {
      return res.status(400).json({
        error: 'Liquidity Shield check failed',
        message: liquidityCheck.reason,
        details: liquidityCheck.details
      });
    }

    const sweepConfig = await SalaryDaySweep.createSweepConfiguration(userId, value);
    
    res.status(201).json({
      success: true,
      data: sweepConfig
    });

  } catch (error) {
    next(error);
  }
});

// Get user's sweep configuration
router.get('/config', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = require('../database/connection');
    
    const config = await db('sweep_configurations')
      .where('user_id', userId)
      .first();

    res.json({
      success: true,
      data: config || null
    });

  } catch (error) {
    next(error);
  }
});

// Get sweep transactions
router.get('/transactions', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = require('../database/connection');
    
    const transactions = await db('sweep_transactions')
      .where('user_id', userId)
      .orderBy('executed_at', 'desc')
      .limit(50);

    res.json({
      success: true,
      data: transactions
    });

  } catch (error) {
    next(error);
  }
});

// Get sweep balance
router.get('/balance', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const balance = await SalaryDaySweep.getAvailableSweepBalance(userId);

    res.json({
      success: true,
      data: {
        available_balance: balance
      }
    });

  } catch (error) {
    next(error);
  }
});

// Update sweep configuration
router.put('/config', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Validate request body
    const { error, value } = updateSweepConfigSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }
    
    const db = require('../database/connection');

    // Get old config for audit
    const oldConfig = await db('sweep_configurations')
      .where('user_id', userId)
      .first();

    // Update existing configuration
    const updatedConfig = await db('sweep_configurations')
      .where('user_id', userId)
      .update({
        ...value,
        updated_at: new Date()
      })
      .returning('*');

    if (updatedConfig.length === 0) {
      return res.status(404).json({ error: 'Sweep configuration not found' });
    }

    // Log configuration update
    await db('audit_logs').insert({
      user_id: userId,
      action: 'update',
      resource_type: 'sweep_config',
      resource_id: oldConfig.id,
      old_values: oldConfig,
      new_values: value,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });

    res.json({
      success: true,
      data: updatedConfig[0]
    });

  } catch (error) {
    next(error);
  }
});

// Deactivate sweep configuration
router.delete('/config', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = require('../database/connection');

    // Get old config for audit
    const oldConfig = await db('sweep_configurations')
      .where('user_id', userId)
      .first();

    if (!oldConfig) {
      return res.status(404).json({ error: 'Sweep configuration not found' });
    }

    await db('sweep_configurations')
      .where('user_id', userId)
      .update({
        is_active: false,
        updated_at: new Date()
      });

    // Log configuration deactivation
    await db('audit_logs').insert({
      user_id: userId,
      action: 'deactivate',
      resource_type: 'sweep_config',
      resource_id: oldConfig.id,
      old_values: oldConfig,
      new_values: { is_active: false },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });

    res.json({
      success: true,
      message: 'Sweep configuration deactivated'
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
