const db = require('../database/connection');
const cron = require('node-cron');
const logger = require('../utils/logger');

class SalaryDaySweep {
  /**
   * Salary-Day Sweep Logic
   * Automatically sweeps funds on salary days to manage bill payments
   */
  static async initializeSweepScheduler() {
    // Run sweep check every day at 6 AM
    cron.schedule('0 6 * * *', async () => {
      logger.info('Running daily sweep check');
      await this.processPendingSweeps();
    });

    // Run bill payment processing every day at 8 AM
    cron.schedule('0 8 * * *', async () => {
      logger.info('Processing bill payments');
      await this.processBillPayments();
    });

    logger.info('Salary-Day Sweep scheduler initialized');
  }

  static async processPendingSweeps() {
    try {
      const today = new Date();
      
      // Get all active sweep configurations due today
      const dueSweeps = await db('sweep_configurations')
        .join('users', 'sweep_configurations.user_id', 'users.id')
        .where('sweep_configurations.is_active', true)
        .where('sweep_configurations.next_sweep_date', '<=', today)
        .select(
          'sweep_configurations.*',
          'users.monthly_income',
          'users.bank_account_number',
          'users.salary_day'
        );

      logger.info(`Found ${dueSweeps.length} sweeps due for processing`);

      for (const sweep of dueSweeps) {
        await this.executeSweep(sweep);
      }

    } catch (error) {
      logger.error('Error processing pending sweeps:', error);
    }
  }

  static async executeSweep(sweepConfig) {
    const transaction = await db.transaction();
    
    try {
      // Calculate sweep amount
      const sweepAmount = this.calculateSweepAmount(sweepConfig);
      
      if (sweepAmount <= 0) {
        logger.warn(`Invalid sweep amount for user ${sweepConfig.user_id}: ${sweepAmount}`);
        await transaction.rollback();
        return;
      }

      // Create sweep transaction record
      const transactionData = {
        sweep_config_id: sweepConfig.id,
        user_id: sweepConfig.user_id,
        amount_swept: sweepAmount,
        salary_amount: sweepConfig.monthly_income,
        transaction_reference: this.generateTransactionReference(),
        status: 'pending',
        executed_at: new Date()
      };

      const [sweepTransaction] = await transaction('sweep_transactions')
        .insert(transactionData)
        .returning('*');

      // Execute the actual bank sweep (this would integrate with Bahrain banking APIs)
      const sweepResult = await this.executeBankSweep(sweepConfig, sweepAmount, sweepTransaction.transaction_reference);

      if (sweepResult.success) {
        // Update transaction as completed
        await transaction('sweep_transactions')
          .where('id', sweepTransaction.id)
          .update({
            status: 'completed',
            completed_at: new Date()
          });

        // Update next sweep date
        const nextSweepDate = this.calculateNextSweepDate(sweepConfig);
        await transaction('sweep_configurations')
          .where('id', sweepConfig.id)
          .update({
            last_sweep_date: new Date(),
            next_sweep_date: nextSweepDate,
            updated_at: new Date()
          });

        logger.info(`Successfully executed sweep for user ${sweepConfig.user_id}: ${sweepAmount} BHD`);
        
      } else {
        // Mark transaction as failed
        await transaction('sweep_transactions')
          .where('id', sweepTransaction.id)
          .update({
            status: 'failed',
            failure_reason: sweepResult.error
          });

        logger.error(`Sweep failed for user ${sweepConfig.user_id}: ${sweepResult.error}`);
      }

      await transaction.commit();

    } catch (error) {
      await transaction.rollback();
      logger.error(`Error executing sweep for user ${sweepConfig.user_id}:`, error);
    }
  }

  static calculateSweepAmount(sweepConfig) {
    const { sweep_percentage, minimum_sweep_amount, maximum_sweep_amount, monthly_income } = sweepConfig;
    
    let sweepAmount = (parseFloat(monthly_income) * parseFloat(sweep_percentage)) / 100;
    
    // Apply minimum and maximum constraints
    sweepAmount = Math.max(parseFloat(minimum_sweep_amount), sweepAmount);
    
    if (maximum_sweep_amount) {
      sweepAmount = Math.min(parseFloat(maximum_sweep_amount), sweepAmount);
    }

    return Math.round(sweepAmount * 1000) / 1000; // Round to 3 decimal places for BHD
  }

  static calculateNextSweepDate(sweepConfig) {
    const { sweep_frequency, sweep_day_before_salary, salary_day } = sweepConfig;
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Calculate next salary date
    let nextSalaryDate = new Date(currentYear, currentMonth, parseInt(salary_day));
    
    // If salary date has passed this month, move to next month
    if (nextSalaryDate <= today) {
      nextSalaryDate = new Date(currentYear, currentMonth + 1, parseInt(salary_day));
    }

    // Calculate sweep date (days before salary)
    const sweepDate = new Date(nextSalaryDate);
    sweepDate.setDate(sweepDate.getDate() - parseInt(sweep_day_before_salary));

    // Adjust frequency if needed
    if (sweep_frequency === 'bi_weekly') {
      // For bi-weekly, add 14 days
      sweepDate.setDate(sweepDate.getDate() + 14);
    }

    return sweepDate;
  }

  static async executeBankSweep(sweepConfig, amount, reference) {
    try {
      // This would integrate with Bahrain's banking system
      // For now, simulating the bank API call
      
      logger.info(`Executing bank sweep: ${amount} BHD from account ${sweepConfig.bank_account_number}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate success (in production, this would be actual bank API response)
      return {
        success: true,
        transactionId: reference,
        amount: amount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async processBillPayments() {
    try {
      // Get upcoming bills due in next 7 days
      const upcomingBills = await db('bills')
        .join('users', 'bills.user_id', 'users.id')
        .leftJoin('sweep_configurations', 'bills.user_id', 'sweep_configurations.user_id')
        .where('bills.is_active', true)
        .where('bills.is_autopay_enabled', true)
        .where('bills.due_date', '<=', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
        .select(
          'bills.*',
          'users.bank_account_number',
          'sweep_configurations.id as sweep_config_id'
        );

      logger.info(`Found ${upcomingBills.length} bills for automatic payment`);

      for (const bill of upcomingBills) {
        await this.processBillPayment(bill);
      }

    } catch (error) {
      logger.error('Error processing bill payments:', error);
    }
  }

  static async processBillPayment(bill) {
    const transaction = await db.transaction();
    
    try {
      // Check if user has sufficient sweep balance
      const availableBalance = await this.getAvailableSweepBalance(bill.user_id);
      
      if (availableBalance < parseFloat(bill.amount_due)) {
        logger.warn(`Insufficient balance for bill payment - User: ${bill.user_id}, Bill: ${bill.id}`);
        await transaction.rollback();
        return;
      }

      // Create bill payment record
      const paymentData = {
        bill_id: bill.id,
        user_id: bill.user_id,
        amount_paid: bill.amount_due,
        payment_method: 'sweep',
        transaction_reference: this.generateTransactionReference(),
        status: 'pending',
        payment_date: new Date()
      };

      const [billPayment] = await transaction('bill_payments')
        .insert(paymentData)
        .returning('*');

      // Execute the actual payment (this would integrate with biller APIs)
      const paymentResult = await this.executeBillPayment(bill, billPayment.transaction_reference);

      if (paymentResult.success) {
        // Update payment as completed
        await transaction('bill_payments')
          .where('id', billPayment.id)
          .update({
            status: 'completed',
            updated_at: new Date()
          });

        // Update bill last payment date
        await transaction('bills')
          .where('id', bill.id)
          .update({
            last_payment_date: new Date(),
            updated_at: new Date()
          });

        logger.info(`Successfully paid bill ${bill.id} for user ${bill.user_id}: ${bill.amount_due} BHD`);
        
      } else {
        // Mark payment as failed
        await transaction('bill_payments')
          .where('id', billPayment.id)
          .update({
            status: 'failed',
            notes: paymentResult.error,
            updated_at: new Date()
          });

        logger.error(`Bill payment failed for user ${bill.user_id}, bill ${bill.id}: ${paymentResult.error}`);
      }

      await transaction.commit();

    } catch (error) {
      await transaction.rollback();
      logger.error(`Error processing bill payment for user ${bill.user_id}, bill ${bill.id}:`, error);
    }
  }

  static async getAvailableSweepBalance(userId) {
    // Calculate available balance from successful sweeps minus paid bills
    const totalSwept = await db('sweep_transactions')
      .where('user_id', userId)
      .where('status', 'completed')
      .sum('amount_swept as total')
      .first();

    const totalPaid = await db('bill_payments')
      .where('user_id', userId)
      .where('status', 'completed')
      .sum('amount_paid as total')
      .first();

    const swept = parseFloat(totalSwept.total) || 0;
    const paid = parseFloat(totalPaid.total) || 0;

    return swept - paid;
  }

  static async executeBillPayment(bill, reference) {
    try {
      // This would integrate with various biller APIs
      // For now, simulating the biller API call
      
      logger.info(`Executing bill payment: ${bill.amount_due} BHD to ${bill.provider_name}`);
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simulate success (in production, this would be actual biller API response)
      return {
        success: true,
        transactionId: reference,
        amount: bill.amount_due,
        biller: bill.provider_name,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  static generateTransactionReference() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `KF${timestamp}${random}`.toUpperCase();
  }

  static async performLiquidityShield(userId, sweepConfig) {
    try {
      // Get user's financial data
      const user = await db('users').where('id', userId).first();
      if (!user) {
        return {
          passed: false,
          reason: 'User not found',
          details: null
        };
      }

      const monthlyIncome = parseFloat(user.monthly_income);
      const sweepPercentage = parseFloat(sweepConfig.sweep_percentage);
      const minimumSweepAmount = parseFloat(sweepConfig.minimum_sweep_amount);

      // Check 1: Income stability (last 3 months)
      const incomeStability = await this.getIncomeStability(userId);
      if (incomeStability.length < 3) {
        return {
          passed: false,
          reason: 'Insufficient income history',
          details: 'At least 3 months of income history required for sweep configuration'
        };
      }

      const salaries = incomeStability.map(t => parseFloat(t.salary_amount));
      const mean = salaries.reduce((a, b) => a + b, 0) / salaries.length;
      const variance = salaries.reduce((sum, salary) => sum + Math.pow(salary - mean, 2), 0) / salaries.length;
      const standardDeviation = Math.sqrt(variance);
      const coefficientOfVariation = standardDeviation / mean;

      // Income must be relatively stable (CV < 0.2)
      if (coefficientOfVariation > 0.2) {
        return {
          passed: false,
          reason: 'Income instability detected',
          details: `Income coefficient of variation (${(coefficientOfVariation * 100).toFixed(1)}%) exceeds acceptable threshold (20%)`
        };
      }

      // Check 2: Debt-to-income ratio
      const totalMonthlyDebt = await this.calculateTotalMonthlyDebt(userId);
      const debtToIncomeRatio = totalMonthlyDebt / monthlyIncome;

      if (debtToIncomeRatio > 0.4) {
        return {
          passed: false,
          reason: 'High debt-to-income ratio',
          details: `Current DTI ratio (${(debtToIncomeRatio * 100).toFixed(1)}%) exceeds acceptable threshold (40%)`
        };
      }

      // Check 3: Sweep amount reasonableness
      const estimatedSweepAmount = Math.max(
        (monthlyIncome * sweepPercentage) / 100,
        minimumSweepAmount
      );

      // Sweep should not leave user with less than 30% of income after debt payments
      const remainingIncome = monthlyIncome - totalMonthlyDebt - estimatedSweepAmount;
      const remainingIncomeRatio = remainingIncome / monthlyIncome;

      if (remainingIncomeRatio < 0.3) {
        return {
          passed: false,
          reason: 'Insufficient remaining income',
          details: `Proposed sweep would leave only ${(remainingIncomeRatio * 100).toFixed(1)}% of income after debt payments`
        };
      }

      // Check 4: Payment history
      const paymentHistory = await this.getPaymentHistory(userId);
      let onTimeRate = 1.0; // Default to perfect if no history
      
      if (paymentHistory.length > 0) {
        const onTimePayments = paymentHistory.filter(payment => {
          const paymentDate = new Date(payment.payment_date);
          const dueDate = new Date(payment.due_date);
          return paymentDate <= dueDate;
        }).length;
        
        onTimeRate = onTimePayments / paymentHistory.length;
        
        if (onTimeRate < 0.8) {
          return {
            passed: false,
            reason: 'Poor payment history',
            details: `On-time payment rate (${(onTimeRate * 100).toFixed(1)}%) is below acceptable threshold (80%)`
          };
        }
      }

      // All checks passed
      return {
        passed: true,
        reason: 'Liquidity Shield check passed',
        details: {
          incomeStability: {
            coefficientOfVariation: (coefficientOfVariation * 100).toFixed(1) + '%',
            status: 'stable'
          },
          debtToIncomeRatio: (debtToIncomeRatio * 100).toFixed(1) + '%',
          estimatedSweepAmount: estimatedSweepAmount.toFixed(3) + ' BHD',
          remainingIncomeRatio: (remainingIncomeRatio * 100).toFixed(1) + '%',
          paymentHistory: paymentHistory.length > 0 ? {
            onTimeRate: (onTimeRate * 100).toFixed(1) + '%',
            status: 'good'
          } : {
            status: 'no_history'
          }
        }
      };

    } catch (error) {
      logger.error('Liquidity Shield check error:', error);
      return {
        passed: false,
        reason: 'System error during liquidity check',
        details: error.message
      };
    }
  }

  static async calculateTotalMonthlyDebt(userId) {
    const monthlyBills = await db('bills')
      .where('user_id', userId)
      .where('is_active', true)
      .where('frequency', 'monthly');

    return monthlyBills.reduce((sum, bill) => 
      sum + parseFloat(bill.amount_due), 0);
  }

  static async getPaymentHistory(userId) {
    return await db('bill_payments')
      .join('bills', 'bill_payments.bill_id', 'bills.id')
      .where('bill_payments.user_id', userId)
      .where('bill_payments.status', 'completed')
      .orderBy('bill_payments.payment_date', 'desc')
      .limit(24); // Last 24 payments
  }

  static async getIncomeStability(userId) {
    // Get salary sweep transactions to assess income consistency
    return await db('sweep_transactions')
      .where('user_id', userId)
      .where('status', 'completed')
      .orderBy('executed_at', 'desc')
      .limit(12); // Last 12 months
  }

  static async createSweepConfiguration(userId, configData) {
    try {
      const sweepConfig = {
        user_id: userId,
        sweep_percentage: configData.sweep_percentage,
        minimum_sweep_amount: configData.minimum_sweep_amount,
        maximum_sweep_amount: configData.maximum_sweep_amount,
        sweep_frequency: configData.sweep_frequency || 'monthly',
        sweep_day_before_salary: configData.sweep_day_before_salary || 3,
        next_sweep_date: this.calculateNextSweepDate({
          ...configData,
          salary_day: configData.salary_day
        })
      };

      const [result] = await db('sweep_configurations')
        .insert(sweepConfig)
        .returning('*');

      logger.info(`Created sweep configuration for user ${userId}`);
      return result;

    } catch (error) {
      logger.error('Error creating sweep configuration:', error);
      throw error;
    }
  }
}

module.exports = SalaryDaySweep;
