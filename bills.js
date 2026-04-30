const express = require('express');
const router = express.Router();
const Joi = require('joi');
const db = require('../database/connection');
const auth = require('../middleware/auth');

// Validation schemas
const createBillSchema = Joi.object({
  bill_type: Joi.string().valid('utility', 'loan', 'credit_card', 'subscription', 'insurance', 'rent').required(),
  provider_name: Joi.string().min(2).max(100).required(),
  account_number: Joi.string().min(5).max(50).required(),
  amount_due: Joi.number().positive().precision(3).required(),
  minimum_payment: Joi.number().positive().precision(3).optional(),
  due_date: Joi.date().min('now').required(),
  frequency: Joi.string().valid('monthly', 'weekly', 'quarterly', 'annually').required(),
  is_autopay_enabled: Joi.boolean().default(false),
  priority_level: Joi.number().integer().min(1).max(3).default(1),
  late_fee_amount: Joi.number().positive().precision(3).optional(),
  notes: Joi.string().max(500).optional()
});

const updateBillSchema = Joi.object({
  bill_type: Joi.string().valid('utility', 'loan', 'credit_card', 'subscription', 'insurance', 'rent').optional(),
  provider_name: Joi.string().min(2).max(100).optional(),
  account_number: Joi.string().min(5).max(50).optional(),
  amount_due: Joi.number().positive().precision(3).optional(),
  minimum_payment: Joi.number().positive().precision(3).optional(),
  due_date: Joi.date().min('now').optional(),
  frequency: Joi.string().valid('monthly', 'weekly', 'quarterly', 'annually').optional(),
  is_autopay_enabled: Joi.boolean().optional(),
  priority_level: Joi.number().integer().min(1).max(3).optional(),
  late_fee_amount: Joi.number().positive().precision(3).optional(),
  notes: Joi.string().max(500).optional()
});

const toggleAutopaySchema = Joi.object({
  is_autopay_enabled: Joi.boolean().required()
});

// Get all bills for a user
router.get('/', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, type } = req.query;
    
    let query = db('bills').where('user_id', userId);
    
    if (status === 'active') {
      query = query.where('is_active', true);
    } else if (status === 'inactive') {
      query = query.where('is_active', false);
    }
    
    if (type) {
      query = query.where('bill_type', type);
    }
    
    const bills = await query.orderBy('due_date', 'asc');
    
    res.json({
      success: true,
      data: bills
    });

  } catch (error) {
    next(error);
  }
});

// Create a new bill
router.post('/', auth, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = createBillSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }

    const userId = req.user.id;
    const billData = {
      ...value,
      user_id: userId
    };

    const [bill] = await db('bills').insert(billData).returning('*');
    
    // Log bill creation
    await db('audit_logs').insert({
      user_id: userId,
      action: 'create',
      resource_type: 'bill',
      resource_id: bill.id,
      new_values: billData,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });
    
    res.status(201).json({
      success: true,
      data: bill
    });

  } catch (error) {
    next(error);
  }
});

// Get specific bill
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const bill = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .first();
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json({
      success: true,
      data: bill
    });

  } catch (error) {
    next(error);
  }
});

// Update bill
router.put('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Validate request body
    const { error, value } = updateBillSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }
    
    // Get old values for audit
    const oldBill = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .first();
    
    if (!oldBill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const [bill] = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .update({
        ...value,
        updated_at: new Date()
      })
      .returning('*');
    
    // Log bill update
    await db('audit_logs').insert({
      user_id: userId,
      action: 'update',
      resource_type: 'bill',
      resource_id: id,
      old_values: oldBill,
      new_values: value,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });
    
    res.json({
      success: true,
      data: bill
    });

  } catch (error) {
    next(error);
  }
});

// Delete bill (soft delete)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get old values for audit
    const oldBill = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .first();
    
    if (!oldBill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .update({
        is_active: false,
        updated_at: new Date()
      });
    
    // Log bill deletion
    await db('audit_logs').insert({
      user_id: userId,
      action: 'delete',
      resource_type: 'bill',
      resource_id: id,
      old_values: oldBill,
      new_values: { is_active: false },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });
    
    res.json({
      success: true,
      message: 'Bill deactivated'
    });

  } catch (error) {
    next(error);
  }
});

// Get bill payments
router.get('/:id/payments', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Verify bill belongs to user
    const bill = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .first();
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const payments = await db('bill_payments')
      .where('bill_id', id)
      .orderBy('payment_date', 'desc');
    
    res.json({
      success: true,
      data: payments
    });

  } catch (error) {
    next(error);
  }
});

// Get upcoming bills (next 30 days)
router.get('/upcoming/30days', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingBills = await db('bills')
      .where('user_id', userId)
      .where('is_active', true)
      .where('due_date', '<=', thirtyDaysFromNow)
      .where('due_date', '>=', new Date())
      .orderBy('due_date', 'asc');
    
    res.json({
      success: true,
      data: upcomingBills
    });

  } catch (error) {
    next(error);
  }
});

// Toggle autopay for bill
router.patch('/:id/autopay', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Validate request body
    const { error, value } = toggleAutopaySchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      return next(error);
    }
    
    const { is_autopay_enabled } = value;
    
    // Get old values for audit
    const oldBill = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .first();
    
    if (!oldBill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    const [bill] = await db('bills')
      .where('id', id)
      .where('user_id', userId)
      .update({
        is_autopay_enabled: is_autopay_enabled,
        updated_at: new Date()
      })
      .returning('*');
    
    // Log autopay toggle
    await db('audit_logs').insert({
      user_id: userId,
      action: 'toggle_autopay',
      resource_type: 'bill',
      resource_id: id,
      old_values: { is_autopay_enabled: oldBill.is_autopay_enabled },
      new_values: { is_autopay_enabled: is_autopay_enabled },
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });
    
    res.json({
      success: true,
      data: bill
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
