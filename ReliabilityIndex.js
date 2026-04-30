const db = require('../database/connection');

class ReliabilityIndex {
  /**
   * Calculate Bayesian Probability Model for credit scoring
   * This implements the core Kafeel Reliability Index algorithm
   */
  static async calculateReliabilityScore(userId) {
    try {
      // Get user data
      const user = await db('users').where('id', userId).first();
      if (!user) {
        throw new Error('User not found');
      }

      // Get user's payment history
      const paymentHistory = await this.getPaymentHistory(userId);
      
      // Get user's employment and income stability
      const incomeStability = await this.getIncomeStability(userId);
      
      // Calculate base scores (0-100)
      const paymentHistoryScore = this.calculatePaymentHistoryScore(paymentHistory);
      const incomeStabilityScore = this.calculateIncomeStabilityScore(incomeStability, user);
      const employmentHistoryScore = this.calculateEmploymentHistoryScore(user);
      const debtToIncomeRatioScore = await this.calculateDebtToIncomeRatioScore(userId);

      // Bayesian adjustment factors
      const bayesianFactors = await this.getBayesianFactors(userId);
      
      // Calculate base score (weighted average)
      const baseScore = (
        paymentHistoryScore * 0.35 +
        incomeStabilityScore * 0.25 +
        employmentHistoryScore * 0.20 +
        debtToIncomeRatioScore * 0.20
      );

      // Apply Bayesian adjustment
      const { adjustedScore, confidenceLevel } = this.applyBayesianAdjustment(
        baseScore,
        bayesianFactors,
        paymentHistory.length
      );

      // Store the calculated score
      const scoreData = {
        user_id: userId,
        base_score: baseScore,
        bayesian_score: adjustedScore,
        confidence_level: confidenceLevel,
        score_factors: {
          payment_history: paymentHistoryScore,
          income_stability: incomeStabilityScore,
          employment_history: employmentHistoryScore,
          debt_to_income_ratio: debtToIncomeRatioScore,
          bayesian_adjustment: bayesianFactors
        },
        payment_history_score: paymentHistoryScore,
        income_stability_score: incomeStabilityScore,
        employment_history_score: employmentHistoryScore,
        debt_to_income_ratio_score: debtToIncomeRatioScore,
        next_review_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      };

      // Upsert the reliability score
      await db('reliability_scores')
        .insert(scoreData)
        .onConflict('user_id')
        .merge(scoreData);

      return {
        reliabilityScore: adjustedScore,
        confidenceLevel,
        baseScore,
        factors: scoreData.score_factors
      };

    } catch (error) {
      console.error('Error calculating reliability score:', error);
      throw error;
    }
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

  static calculatePaymentHistoryScore(paymentHistory) {
    if (paymentHistory.length === 0) return 50; // Neutral score for no history

    const onTimePayments = paymentHistory.filter(payment => {
      const paymentDate = new Date(payment.payment_date);
      const dueDate = new Date(payment.due_date);
      return paymentDate <= dueDate;
    }).length;

    const onTimeRate = onTimePayments / paymentHistory.length;
    
    // Apply logistic curve for more nuanced scoring
    return Math.round(100 / (1 + Math.exp(-10 * (onTimeRate - 0.5))));
  }

  static calculateIncomeStabilityScore(incomeStability, user) {
    if (incomeStability.length < 3) return 60; // Limited history

    const salaries = incomeStability.map(t => parseFloat(t.salary_amount));
    const mean = salaries.reduce((a, b) => a + b, 0) / salaries.length;
    const variance = salaries.reduce((sum, salary) => sum + Math.pow(salary - mean, 2), 0) / salaries.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / mean;

    // Lower variation = higher score
    const stabilityScore = Math.max(0, Math.min(100, 100 - (coefficientOfVariation * 200)));
    return Math.round(stabilityScore);
  }

  static calculateEmploymentHistoryScore(user) {
    // Simplified scoring based on employment status and duration
    const employmentScores = {
      'permanent': 90,
      'contract': 70,
      'self-employed': 60,
      'part-time': 50,
      'unemployed': 20
    };

    const baseScore = employmentScores[user.employment_status.toLowerCase()] || 50;
    
    // Bonus points for having employer information
    const employerBonus = user.employer_name ? 10 : 0;
    
    return Math.min(100, baseScore + employerBonus);
  }

  static async calculateDebtToIncomeRatioScore(userId) {
    const user = await db('users').where('id', userId).first();
    const monthlyIncome = parseFloat(user.monthly_income);

    // Get total monthly bill obligations
    const monthlyBills = await db('bills')
      .where('user_id', userId)
      .where('is_active', true)
      .where('frequency', 'monthly');

    const totalMonthlyDebt = monthlyBills.reduce((sum, bill) => 
      sum + parseFloat(bill.amount_due), 0);

    const debtToIncomeRatio = totalMonthlyDebt / monthlyIncome;

    // Score based on DTI ratio (lower is better)
    if (debtToIncomeRatio <= 0.2) return 100;
    if (debtToIncomeRatio <= 0.3) return 85;
    if (debtToIncomeRatio <= 0.4) return 70;
    if (debtToIncomeRatio <= 0.5) return 50;
    if (debtToIncomeRatio <= 0.6) return 30;
    return 10;
  }

  static async getBayesianFactors(userId) {
    // Get market-level factors for Bayesian adjustment
    const marketData = await this.getMarketLevelFactors();
    const userSegment = await this.getUserSegment(userId);

    return {
      marketAdjustment: marketData.averageReliability || 75,
      segmentAdjustment: userSegment.averageScore || 70,
      economicFactor: marketData.economicIndicator || 1.0,
      seasonalFactor: this.getSeasonalFactor()
    };
  }

  static applyBayesianAdjustment(baseScore, factors, dataPoints) {
    // Bayesian inference: P(Score|Data) ∝ P(Data|Score) × P(Score)
    const marketPrior = factors.marketAdjustment / 100;
    const segmentPrior = factors.segmentAdjustment / 100;
    
    // Weight based on amount of data (more data = more confidence in user's actual score)
    const dataWeight = Math.min(1, dataPoints / 12); // Max weight at 12 data points
    const priorWeight = 1 - dataWeight;
    
    // Combine user score with prior beliefs
    const adjustedScore = (baseScore * dataWeight) + 
                         ((marketPrior * 0.6 + segmentPrior * 0.4) * 100 * priorWeight);
    
    // Apply economic and seasonal factors
    const finalScore = adjustedScore * factors.economicFactor * factors.seasonalFactor;
    
    // Calculate confidence level
    const confidenceLevel = Math.min(100, dataPoints * 8 + 20); // More data = higher confidence

    return {
      adjustedScore: Math.round(Math.max(0, Math.min(100, finalScore))),
      confidenceLevel: Math.round(confidenceLevel)
    };
  }

  static async getMarketLevelFactors() {
    // This would typically pull from market data or analytics
    // For now, returning placeholder values
    return {
      averageReliability: 75,
      economicIndicator: 1.0
    };
  }

  static async getUserSegment(userId) {
    const user = await db('users').where('id', userId).first();
    
    // Simple segmentation based on income and employment
    let segment = 'standard';
    let averageScore = 70;

    if (user.monthly_income >= 2000) {
      segment = 'high_income';
      averageScore = 85;
    } else if (user.employment_status === 'permanent') {
      segment = 'stable_employment';
      averageScore = 80;
    }

    return { segment, averageScore };
  }

  static getSeasonalFactor() {
    const month = new Date().getMonth();
    
    // Apply seasonal adjustments (e.g., holiday spending, bonus seasons)
    const seasonalFactors = {
      11: 0.95, // December - holiday spending
      0: 0.95,  // January - post-holiday
      2: 1.05,  // March - bonus season in Bahrain
      3: 1.05   // April
    };

    return seasonalFactors[month] || 1.0;
  }
}

module.exports = ReliabilityIndex;
