import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  CreditCard, 
  Smartphone, 
  Wallet as WalletIcon, 
  TrendingUp,
  Check,
  AlertCircle,
  Info,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

type PaymentMethod = "card" | "upi" | "wallet" | "emi";

interface PaymentOptionsProps {
  userId: string | null;
  totalAmount: number;
  onPaymentSelect: (method: PaymentMethod, emiTenure?: number) => void;
  className?: string;
  /** Pass the current user's wallet balance directly (from auth-context) */
  walletBalance?: number;
  bookingDetails?: {
    bookingType: string;
    title: string;
    passengerName: string;
    passengerEmail: string;
    passengerPhone: string;
  };
}

const EMI_OPTIONS = [
  { tenure: 3, interestRate: 0, label: "3 Months (No Cost)" },
  { tenure: 6, interestRate: 5, label: "6 Months (5% p.a.)" },
  { tenure: 9, interestRate: 7, label: "9 Months (7% p.a.)" },
  { tenure: 12, interestRate: 9, label: "12 Months (9% p.a.)" },
];

export function PaymentOptions({ userId, totalAmount, onPaymentSelect, className, walletBalance: walletBalanceProp, bookingDetails }: PaymentOptionsProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("card");
  const [selectedEmiTenure, setSelectedEmiTenure] = useState<number>(3);
  
  // Card payment states
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  
  // UPI payment states
  const [upiId, setUpiId] = useState("");
  const [upiPaymentMode, setUpiPaymentMode] = useState<"id" | "intent">("intent");
  
  // Use walletBalance prop when provided; fall back to 0
  const walletBalance = walletBalanceProp ?? 0;
  const hasInsufficientBalance = selectedMethod === "wallet" && walletBalance < totalAmount;

  // Calculate EMI details
  const calculateEMI = (amount: number, tenure: number, rate: number) => {
    if (rate === 0) {
      return {
        monthlyPayment: Math.ceil(amount / tenure),
        totalAmount: amount,
        processingFee: 0,
      };
    }

    const monthlyRate = rate / 100 / 12;
    const processingFee = Math.ceil(amount * 0.02); // 2% processing fee
    const principal = amount + processingFee;
    const emi = Math.ceil(
      (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
      (Math.pow(1 + monthlyRate, tenure) - 1)
    );

    return {
      monthlyPayment: emi,
      totalAmount: emi * tenure,
      processingFee,
    };
  };  const selectedEmiOption = EMI_OPTIONS.find(opt => opt.tenure === selectedEmiTenure);
  const emiDetails = selectedEmiOption 
    ? calculateEMI(totalAmount, selectedEmiOption.tenure, selectedEmiOption.interestRate)
    : null;
    
  const handleProceed = async () => {
    // Validate based on selected method
    if (selectedMethod === "wallet") {
      if (hasInsufficientBalance) {
        return;
      }
      onPaymentSelect("wallet");
      return;
    }

    if (selectedMethod === "card") {
      onPaymentSelect("card");
      return;
    }
    
    if (selectedMethod === "upi") {
      onPaymentSelect("upi");
      return;
    }

    if (selectedMethod === "emi") {
      onPaymentSelect("emi", selectedEmiTenure);
      return;
    }
  };
  
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Select Payment Method
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as PaymentMethod)}>{/* Credit/Debit Card */}
          <div className={cn(
            "flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
            selectedMethod === "card" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
            onClick={() => setSelectedMethod("card")}
          >
            <RadioGroupItem value="card" id="card" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="card" className="flex items-center gap-2 cursor-pointer font-semibold text-base">
                <CreditCard className="w-5 h-5 text-primary" />
                Credit / Debit Card
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Pay securely using your credit or debit card
              </p>
              {selectedMethod === "card" && (
                <>
                  <div className="mt-3 flex items-center gap-2 text-sm text-green-600 mb-4">
                    <Check className="w-4 h-4" />
                    <span>Instant confirmation</span>
                  </div>
                  
                  {/* Card Details Form */}
                  <div className="space-y-3 mt-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="cardNumber" className="text-sm flex items-center gap-2">
                        <Lock className="w-3 h-3" />
                        Card Number
                      </Label>
                      <Input
                        id="cardNumber"
                        placeholder="1234 5678 9012 3456"
                        value={cardNumber}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\s/g, '');
                          const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
                          setCardNumber(formatted.slice(0, 19));
                        }}
                        maxLength={19}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="cardName" className="text-sm">Cardholder Name</Label>
                      <Input
                        id="cardName"
                        placeholder="CARDHOLDER NAME"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value.toUpperCase())}
                        onClick={(e) => e.stopPropagation()}
                        className="uppercase"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="cardExpiry" className="text-sm">Expiry (MM/YY)</Label>
                        <Input
                          id="cardExpiry"
                          placeholder="12/26"
                          value={cardExpiry}
                          onChange={(e) => {
                            let value = e.target.value.replace(/\D/g, '');
                            if (value.length >= 2) {
                              value = value.slice(0, 2) + '/' + value.slice(2, 4);
                            }
                            setCardExpiry(value.slice(0, 5));
                          }}
                          maxLength={5}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cardCvv" className="text-sm">CVV</Label>
                        <Input
                          id="cardCvv"
                          type="password"
                          placeholder="123"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 3))}
                          maxLength={3}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                      <Lock className="w-3 h-3" />
                      <span>Your card details are encrypted and secure</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>          {/* UPI */}
          <div className={cn(
            "flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
            selectedMethod === "upi" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
            onClick={() => setSelectedMethod("upi")}
          >
            <RadioGroupItem value="upi" id="upi" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="upi" className="flex items-center gap-2 cursor-pointer font-semibold text-base">
                <Smartphone className="w-5 h-5 text-primary" />
                UPI
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Pay using Google Pay, PhonePe, Paytm, or any UPI app
              </p>              {selectedMethod === "upi" && (
                <>
                  <div className="mt-3 flex items-center gap-2 text-sm text-green-600 mb-4">
                    <Check className="w-4 h-4" />
                    <span>Fast & secure</span>
                  </div>
                  
                  {/* UPI Payment Mode Selection */}
                  <div className="space-y-3 mt-4 pt-4 border-t">
                    <Label className="text-sm font-semibold">Choose UPI Payment Method</Label>
                    <RadioGroup 
                      value={upiPaymentMode} 
                      onValueChange={(value) => setUpiPaymentMode(value as "id" | "intent")}
                      className="space-y-2"
                    >
                      {/* UPI ID Option */}
                      <div 
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-md border cursor-pointer",
                          upiPaymentMode === "id" 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:border-primary/30"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUpiPaymentMode("id");
                        }}
                      >
                        <RadioGroupItem value="id" id="upi-id-mode" />
                        <div className="flex-1">
                          <Label htmlFor="upi-id-mode" className="cursor-pointer font-medium">
                            Enter UPI ID
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Manually enter your UPI ID (e.g., yourname@paytm)
                          </p>
                        </div>
                      </div>

                      {/* UPI App Intent Option */}
                      <div 
                        className={cn(
                          "flex items-center space-x-3 p-3 rounded-md border cursor-pointer",
                          upiPaymentMode === "intent" 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:border-primary/30"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUpiPaymentMode("intent");
                        }}
                      >
                        <RadioGroupItem value="intent" id="upi-intent-mode" />
                        <div className="flex-1">
                          <Label htmlFor="upi-intent-mode" className="cursor-pointer font-medium">
                            Select UPI App
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Redirect to Google Pay, PhonePe, Paytm etc.
                          </p>
                        </div>
                      </div>
                    </RadioGroup>

                    {/* Show UPI ID input only when "id" mode is selected */}
                    {upiPaymentMode === "id" && (
                      <div className="space-y-2 pt-3">
                        <Label htmlFor="upiId" className="text-sm">UPI ID</Label>
                        <Input
                          id="upiId"
                          placeholder="yourname@paytm"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          You'll receive a notification on your phone to approve payment
                        </p>
                      </div>
                    )}
                      {/* Show app icons when "intent" mode is selected */}
                    {upiPaymentMode === "intent" && (
                      <div className="space-y-2 pt-3">
                        <Label className="text-sm">Available Payment Apps</Label>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col items-center p-3 bg-white border-2 border-green-200 rounded-lg hover:border-green-400 transition-all cursor-pointer">
                            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center mb-2">
                              <Smartphone className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs font-semibold text-center">Google Pay</span>
                          </div>
                          <div className="flex flex-col items-center p-3 bg-white border-2 border-purple-200 rounded-lg hover:border-purple-400 transition-all cursor-pointer">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center mb-2">
                              <Smartphone className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs font-semibold text-center">PhonePe</span>
                          </div>
                          <div className="flex flex-col items-center p-3 bg-white border-2 border-blue-200 rounded-lg hover:border-blue-400 transition-all cursor-pointer">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center mb-2">
                              <Smartphone className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xs font-semibold text-center">Paytm</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground text-center mt-3 bg-blue-50 p-2 rounded">
                          💡 Click "Proceed" to see all available UPI apps
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Wallet */}
          <div className={cn(
            "flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
            selectedMethod === "wallet" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
            onClick={() => setSelectedMethod("wallet")}
          >
            <RadioGroupItem value="wallet" id="wallet" className="mt-1" disabled={!userId} />
            <div className="flex-1">
              <Label htmlFor="wallet" className={cn(
                "flex items-center gap-2 cursor-pointer font-semibold text-base",
                !userId && "opacity-50"
              )}>
                <WalletIcon className="w-5 h-5 text-primary" />
                Wallet
                {!userId && <span className="text-xs text-muted-foreground">(Login required)</span>}
              </Label>
              {userId ? (
                <>
                  <p className="text-sm text-muted-foreground mt-1">
                    Available Balance: <span className="font-bold text-foreground">₹{walletBalance.toFixed(2)}</span>
                  </p>
                  {selectedMethod === "wallet" && (
                    <div className="mt-3">
                      {hasInsufficientBalance ? (
                        <div className="flex items-center gap-2 text-sm text-red-600">
                          <AlertCircle className="w-4 h-4" />
                          <span>Insufficient balance. Need ₹{(totalAmount - walletBalance).toFixed(2)} more</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <Check className="w-4 h-4" />
                          <span>Sufficient balance</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Please login to use wallet
                </p>
              )}
            </div>
          </div>

          {/* EMI */}
          <div className={cn(
            "flex items-start space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
            selectedMethod === "emi" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          )}
            onClick={() => setSelectedMethod("emi")}
          >
            <RadioGroupItem value="emi" id="emi" className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="emi" className="flex items-center gap-2 cursor-pointer font-semibold text-base">
                <TrendingUp className="w-5 h-5 text-primary" />
                EMI (Easy Installments)
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Pay in easy monthly installments
              </p>
              
              {selectedMethod === "emi" && (
                <div className="mt-4 space-y-3">
                  <Label className="text-sm font-semibold">Select EMI Tenure</Label>
                  <RadioGroup 
                    value={selectedEmiTenure.toString()} 
                    onValueChange={(value) => setSelectedEmiTenure(parseInt(value))}
                    className="space-y-2"
                  >
                    {EMI_OPTIONS.map((option) => {
                      const details = calculateEMI(totalAmount, option.tenure, option.interestRate);
                      return (
                        <div 
                          key={option.tenure}
                          className={cn(
                            "flex items-center space-x-3 p-3 rounded-md border cursor-pointer",
                            selectedEmiTenure === option.tenure 
                              ? "border-primary bg-primary/5" 
                              : "border-border hover:border-primary/30"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEmiTenure(option.tenure);
                          }}
                        >
                          <RadioGroupItem value={option.tenure.toString()} id={`emi-${option.tenure}`} />
                          <div className="flex-1">
                            <Label htmlFor={`emi-${option.tenure}`} className="cursor-pointer font-medium">
                              {option.label}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              ₹{details.monthlyPayment}/month × {option.tenure} months = ₹{details.totalAmount}
                            </p>
                            {details.processingFee > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Processing fee: ₹{details.processingFee}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </div>
              )}
            </div>
          </div>
        </RadioGroup>

        {/* EMI Breakdown */}
        {selectedMethod === "emi" && emiDetails && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-1">
              <div className="font-semibold">EMI Breakdown</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Booking Amount:</span>
                  <span>₹{totalAmount}</span>
                </div>
                {emiDetails.processingFee > 0 && (
                  <div className="flex justify-between">
                    <span>Processing Fee (2%):</span>
                    <span>₹{emiDetails.processingFee}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Total Payable:</span>
                  <span>₹{emiDetails.totalAmount}</span>
                </div>
                <div className="flex justify-between text-primary font-semibold">
                  <span>Monthly Payment:</span>
                  <span>₹{emiDetails.monthlyPayment}</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={handleProceed} 
          className="w-full h-12 text-base font-semibold"
          disabled={hasInsufficientBalance}
        >
          {hasInsufficientBalance ? "Insufficient Wallet Balance" : `Proceed to Pay ₹${totalAmount}`}
        </Button>
      </CardContent>
    </Card>
  );
}
