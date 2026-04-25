import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, RefreshCcw, Home, HelpCircle, Mail, Phone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FailedPaymentDetails {
  bookingId?: string;
  bookingType?: "flight" | "bus" | "hotel" | "package";
  amount?: number;
  errorCode?: string;
  errorDescription?: string;
  errorReason?: string;
  timestamp: string;
  title?: string;
}

export default function PaymentFailed() {
  const [, navigate] = useLocation();
  const [failureDetails, setFailureDetails] = useState<FailedPaymentDetails | null>(null);

  useEffect(() => {
    // Get failure details from localStorage (set by payment error handler)
    const savedFailure = localStorage.getItem("lastFailedPayment");
    if (savedFailure) {
      try {
        const failure = JSON.parse(savedFailure);
        setFailureDetails(failure);
      } catch (error) {
        console.error("Failed to parse failure details:", error);
        setFailureDetails({
          timestamp: new Date().toISOString(),
          errorDescription: "Payment processing failed",
        });
      }
    } else {
      setFailureDetails({
        timestamp: new Date().toISOString(),
        errorDescription: "Payment processing failed",
      });
    }
  }, []);

  const handleRetryPayment = () => {
    // Clear the failure data
    localStorage.removeItem("lastFailedPayment");
    
    // Navigate back to the booking page
    if (failureDetails?.bookingType) {
      navigate(`/${failureDetails.bookingType}s`);
    } else {
      navigate("/");
    }
  };

  const commonErrors = [
    {
      title: "Insufficient Funds",
      description: "Your account doesn't have enough balance to complete this transaction.",
      solution: "Please check your account balance or try a different payment method.",
    },
    {
      title: "Card Declined",
      description: "Your card was declined by the bank.",
      solution: "Please contact your bank or try a different card.",
    },
    {
      title: "Payment Timeout",
      description: "The payment took too long to process.",
      solution: "Please try again with a stable internet connection.",
    },
    {
      title: "Invalid Card Details",
      description: "The card information provided was incorrect.",
      solution: "Please verify your card number, expiry date, and CVV.",
    },
  ];

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 py-12">
        <div className="container mx-auto px-4">
          {/* Error Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-500 text-white mb-6 animate-pulse">
              <XCircle className="w-16 h-16" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-red-700 mb-4">
              Payment Failed
            </h1>
            <p className="text-xl text-gray-600 mb-2">
              We couldn't process your payment
            </p>
            {failureDetails?.bookingId && (
              <p className="text-sm text-muted-foreground">
                Reference: <span className="font-mono font-bold">{failureDetails.bookingId}</span>
              </p>
            )}
          </div>

          {/* Error Details Card */}
          <Card className="max-w-3xl mx-auto shadow-2xl border-2 border-red-200 mb-8">
            <CardHeader className="bg-gradient-to-r from-red-500 to-orange-600 text-white">
              <CardTitle className="flex items-center gap-3 text-2xl">
                <HelpCircle className="w-8 h-8" />
                <span>What went wrong?</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              {/* Error Message */}
              <Alert className="mb-6 border-red-300 bg-red-50">
                <XCircle className="h-5 w-5 text-red-600" />
                <AlertDescription className="text-red-800 font-semibold">
                  {failureDetails?.errorDescription || "Payment could not be processed"}
                </AlertDescription>
              </Alert>

              {/* Error Details */}
              {failureDetails && (
                <div className="grid md:grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                  {failureDetails.errorCode && (
                    <div>
                      <p className="text-xs text-gray-500">Error Code</p>
                      <p className="font-mono font-semibold text-red-600">{failureDetails.errorCode}</p>
                    </div>
                  )}
                  {failureDetails.amount && (
                    <div>
                      <p className="text-xs text-gray-500">Transaction Amount</p>
                      <p className="font-bold text-lg">₹{failureDetails.amount.toFixed(2)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Time</p>
                    <p className="font-semibold text-sm">{new Date(failureDetails.timestamp).toLocaleString()}</p>
                  </div>
                  {failureDetails.bookingType && (
                    <div>
                      <p className="text-xs text-gray-500">Booking Type</p>
                      <p className="font-semibold text-sm capitalize">{failureDetails.bookingType}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              {failureDetails?.errorReason && (
                <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h4 className="font-bold text-orange-900 mb-2">Reason</h4>
                  <p className="text-orange-800">{failureDetails.errorReason}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid md:grid-cols-2 gap-4">
                <Button onClick={handleRetryPayment} size="lg" className="w-full">
                  <RefreshCcw className="w-5 h-5 mr-2" />
                  Try Again
                </Button>
                <Button asChild variant="outline" size="lg" className="w-full">
                  <Link href="/">
                    <Home className="w-5 h-5 mr-2" />
                    Back to Home
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Common Issues Card */}
          <Card className="max-w-3xl mx-auto shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl">Common Payment Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {commonErrors.map((error, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-bold text-gray-900 mb-1">{error.title}</h4>
                    <p className="text-sm text-gray-600 mb-2">{error.description}</p>
                    <p className="text-sm text-primary font-medium">
                      💡 {error.solution}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Support Section */}
          <Card className="max-w-3xl mx-auto mt-8 shadow-xl border-2 border-blue-200">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-xl text-blue-900">Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-gray-700 mb-4">
                Our support team is here to help you 24/7
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg border">
                  <Mail className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-500">Email Support</p>
                    <p className="font-semibold">support@dreamflyglobal.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg border">
                  <Phone className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="text-xs text-gray-500">Phone Support</p>
                    <p className="font-semibold">1800-123-4567</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Notice */}
          <div className="max-w-3xl mx-auto mt-8 text-center">
            <p className="text-sm text-gray-500">
              🔒 Your payment information is secure. No money has been deducted from your account.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
