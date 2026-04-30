const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../database/connection');

// Get user profile
router.get('/profile', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const user = await db('users')
      .where('id', userId)
      .first([
        'id', 'cpr_number', 'email', 'phone_number', 'first_name', 
        'last_name', 'date_of_birth', 'nationality', 'employment_status',
        'monthly_income', 'employer_name', 'bank_name', 'salary_day',
        'is_active', 'is_verified', 'created_at'
      ]);
    
    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const allowedFields = [
      'phone_number', 'first_name', 'last_name', 'employment_status',
      'monthly_income', 'employer_name', 'bank_name', 'salary_day'
    ];
    
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    // Get old values for audit
    const oldUser = await db('users')
      .where('id', userId)
      .first(allowedFields);

    const [user] = await db('users')
      .where('id', userId)
      .update({
        ...updateData,
        updated_at: new Date()
      })
      .returning([
        'id', 'cpr_number', 'email', 'phone_number', 'first_name', 
        'last_name', 'date_of_birth', 'nationality', 'employment_status',
        'monthly_income', 'employer_name', 'bank_name', 'salary_day',
        'is_active', 'is_verified', 'updated_at'
      ]);
    
    // Log profile update
    await db('audit_logs').insert({
      user_id: userId,
      action: 'update',
      resource_type: 'user',
      resource_id: userId,
      old_values: oldUser,
      new_values: updateData,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      created_at: new Date()
    });
    
    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
