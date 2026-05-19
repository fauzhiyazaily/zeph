export type SupportedStatementMimeType =
  | "application/pdf"
  | "application/vnd.ms-excel"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "text/csv"
  | "image/png"
  | "image/jpeg"
  | "image/jpg"
  | "image/webp";

export type StatementDirection = "credit" | "debit";

export type ParsedStatementTransaction = {
  postedAt: string;
  description: string;
  amount: number;
  direction: StatementDirection;
  balance: number | null;
  reference: string | null;
  category: string | null;
  isSalary: boolean;
  isEmi: boolean;
  rawText?: string;
};

export type ParsedBankStatement = {
  bankName: string | null;
  accountHolderName: string | null;
  accountNumberMasked: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  currency: "INR";
  transactions: ParsedStatementTransaction[];
};

export type StatementRecurringPayment = {
  description: string;
  amount: number;
  occurrences: number;
};

export type StatementCategoryTotal = {
  category: string;
  amount: number;
};

export type BankStatementAnalysis = {
  provider: "anthropic" | "heuristic";
  healthScore: number;
  summary: string;
  financialHealth: string;
  totalCredits: number;
  totalDebits: number;
  netCashflow: number;
  savingsRate: number | null;
  salaryCredits: number;
  recurringPayments: StatementRecurringPayment[];
  topCategories: StatementCategoryTotal[];
  riskIndicators: string[];
  recommendations: string[];
  balanceTrend: "up" | "down" | "flat" | "unknown";
};

export type FinancialDocumentSummary = {
  id: string;
  fileName: string;
  parseStatus: "processing" | "completed" | "failed";
  parseError: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumberMasked: string | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  transactionCount: number;
  importedDebitCount: number;
  totalCredits: number;
  totalDebits: number;
  openingBalance: number | null;
  closingBalance: number | null;
  processedAt: string | null;
  createdAt: string;
  analysis: BankStatementAnalysis | null;
};
