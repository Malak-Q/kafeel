exports.up = function(knex) {
  return knex.schema
    // Users table - Core user management
    .createTable('users', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.string('cpr_number', 10).unique().notNullable(); // Bahrain CPR
      table.string('email').unique().notNullable();
      table.string('phone_number').unique().notNullable();
      table.string('first_name').notNullable();
      table.string('last_name').notNullable();
      table.date('date_of_birth').notNullable();
      table.string('nationality', 3).notNullable(); // ISO 3166-1 alpha-3
      table.string('employment_status').notNullable();
      table.decimal('monthly_income', 12, 3).notNullable(); // BHD precision
      table.string('employer_name');
      table.string('bank_account_number').notNullable();
      table.string('bank_name').notNullable();
      table.date('salary_day').notNullable(); // Expected salary date each month
      table.boolean('is_active').defaultTo(true);
      table.boolean('is_verified').defaultTo(false);
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
    })

    // Reliability Index table - Bayesian credit scoring
    .createTable('reliability_scores', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.uuid('user_id').unique().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('base_score', 5, 2).notNullable(); // 0-100
      table.decimal('bayesian_score', 5, 2).notNullable(); // Adjusted score
      table.decimal('confidence_level', 5, 2).notNullable(); // 0-100
      table.text('score_factors').notNullable(); // JSON of contributing factors (SQLite uses TEXT for JSON)
      table.integer('payment_history_score'); // 0-100
      table.integer('income_stability_score'); // 0-100
      table.integer('employment_history_score'); // 0-100
      table.integer('debt_to_income_ratio_score'); // 0-100
      table.datetime('calculated_at').defaultTo(knex.fn.now());
      table.datetime('next_review_date').notNullable();
    })

    // Bill Stack table - Core bill management
    .createTable('bills', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('bill_type').notNullable(); // utility, loan, credit_card, subscription
      table.string('provider_name').notNullable();
      table.string('account_number').notNullable();
      table.decimal('amount_due', 12, 3).notNullable(); // BHD precision
      table.decimal('minimum_payment', 12, 3);
      table.date('due_date').notNullable();
      table.string('frequency').notNullable(); // monthly, weekly, quarterly, annually
      table.boolean('is_autopay_enabled').defaultTo(false);
      table.boolean('is_active').defaultTo(true);
      table.integer('priority_level').defaultTo(1); // 1=high, 2=medium, 3=low
      table.decimal('late_fee_amount', 12, 3);
      table.text('notes');
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
    })

    // Salary Day Sweep table - Automation logic
    .createTable('sweep_configurations', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.decimal('sweep_percentage', 5, 2).notNullable(); // Percentage of salary to sweep
      table.decimal('minimum_sweep_amount', 12, 3).notNullable(); // BHD precision
      table.decimal('maximum_sweep_amount', 12, 3);
      table.boolean('is_active').defaultTo(true);
      table.string('sweep_frequency').defaultTo('monthly'); // monthly, bi_weekly
      table.integer('sweep_day_before_salary'); // Days before expected salary date
      table.datetime('last_sweep_date');
      table.datetime('next_sweep_date').notNullable();
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
    })

    // Sweep Transactions table - Track actual sweep executions
    .createTable('sweep_transactions', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.uuid('sweep_config_id').references('id').inTable('sweep_configurations').onDelete('CASCADE');
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.decimal('amount_swept', 12, 3).notNullable(); // BHD precision
      table.decimal('salary_amount', 12, 3).notNullable(); // BHD precision
      table.string('transaction_reference').unique().notNullable();
      table.string('status').notNullable(); // pending, completed, failed
      table.text('failure_reason');
      table.datetime('executed_at').defaultTo(knex.fn.now());
      table.datetime('completed_at');
    })

    // Bill Payments table - Track actual bill payments
    .createTable('bill_payments', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.uuid('bill_id').references('id').inTable('bills').onDelete('CASCADE');
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.uuid('sweep_transaction_id').references('id').inTable('sweep_transactions').onDelete('SET NULL');
      table.decimal('amount_paid', 12, 3).notNullable(); // BHD precision
      table.string('payment_method').notNullable(); // sweep, manual, bank_transfer
      table.string('transaction_reference').unique().notNullable();
      table.string('status').notNullable(); // pending, completed, failed
      table.date('payment_date').notNullable();
      table.text('notes');
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
    })

    // Audit Log table - Compliance and security
    .createTable('audit_logs', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))))"));
      table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.string('action').notNullable(); // create, update, delete, login, etc.
      table.string('resource_type').notNullable(); // user, bill, sweep_config, etc.
      table.string('resource_id');
      table.text('old_values'); // JSON data stored as TEXT in SQLite
      table.text('new_values'); // JSON data stored as TEXT in SQLite
      table.string('ip_address');
      table.string('user_agent');
      table.datetime('created_at').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('audit_logs')
    .dropTableIfExists('bill_payments')
    .dropTableIfExists('sweep_transactions')
    .dropTableIfExists('sweep_configurations')
    .dropTableIfExists('bills')
    .dropTableIfExists('reliability_scores')
    .dropTableIfExists('users');
};
