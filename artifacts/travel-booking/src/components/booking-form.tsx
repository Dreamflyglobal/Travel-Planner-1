import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useCreateBooking } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Tag, CheckCircle2, XCircle, LogIn, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentOptions } from "@/components/payment-options";
import { SeatSelection } from "@/components/seat-selection";
import { validateCoupon, checkFirstTimeUsage, recordCouponUsage, type Coupon } from "@/lib/coupon";
import { getConvenienceFee, getHiddenMarkupAmount, type ServiceType } from "@/lib/pricing";
import { AvailableCoupons } from "@/components/available-coupons";

const passengerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  countryCode: z.string().min(1, { message: "Please select a country code." }),
  phone: z.string()
    .min(10, { message: "Phone number must be exactly 10 digits." })
    .max(10, { message: "Phone number must be exactly 10 digits." })
    .regex(/^\d{10}$/, { message: "Phone number must be exactly 10 digits without spaces or special characters." }),
  gender: z.enum(["male", "female", "other"], { required_error: "Please select a gender" }),
  age: z.number().min(1).max(120, { message: "Age must be between 1 and 120" }),
});

const formSchema = z.object({
  passengers: z.number().min(1).max(10),
  travelDate: z.string().min(1, "Date is required"),
  passengerDetails: z.array(passengerSchema).min(1),
});

type BookingFormProps = {
  bookingType: "flight" | "bus" | "hotel" | "package";
  referenceId: number;
  pricePerUnit: number;
  title: string;
};

export function BookingForm({ bookingType, referenceId, pricePerUnit, title }: BookingFormProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createBooking = useCreateBooking();
  const { isAuthenticated, user } = useAuth();
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [couponStatus, setCouponStatus] = useState<"idle" | "valid" | "invalid">("idle");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      passengers: 1,
      travelDate: new Date().toISOString().split("T")[0],      passengerDetails: [
        {
          name: "",
          email: "",
          countryCode: "+91",
          phone: "",
          gender: undefined,
          age: undefined as any,
        },
      ],
    },
  });

  const passengersCount = form.watch("passengers");
    // Update passenger details array when passenger count changes
  useEffect(() => {
    const currentDetails = form.getValues("passengerDetails");
    const newCount = passengersCount || 1;
    
    if (currentDetails.length < newCount) {
      // Add more passenger fields
      const newDetails = [...currentDetails];      for (let i = currentDetails.length; i < newCount; i++) {
        newDetails.push({
          name: "",
          email: "",
          countryCode: "+91",
          phone: "",
          gender: undefined as any,
          age: undefined as any,
        });
      }
      form.setValue("passengerDetails", newDetails);
    } else if (currentDetails.length > newCount) {
      // Remove excess passenger fields
      form.setValue("passengerDetails", currentDetails.slice(0, newCount));
    }
  }, [passengersCount, form]);
  const serviceKey = (bookingType + "s") as ServiceType;
  const rawBasePrice = pricePerUnit * (passengersCount || 1);
  // Hidden markup absorbed into displayed Base Price — never shown to customers
  const hiddenMarkupAmount = getHiddenMarkupAmount(rawBasePrice, serviceKey);
  const displayedBasePrice = rawBasePrice + hiddenMarkupAmount;
  // Visible convenience fee
  const convenienceFeeAmount = getConvenienceFee(rawBasePrice, serviceKey);
  const discount = appliedDiscount;
  const finalPrice = Math.max(0, displayedBasePrice + convenienceFeeAmount - discount);

  // User context for coupon eligibility
  const couponContext = useMemo(() => {
    const phone = user?.phone ?? "";
    let userBookingsCount = 0;
    try {
      const stored = JSON.parse(localStorage.getItem("travel_bookings") ?? "[]");
      const session = JSON.parse(localStorage.getItem("msw_mock_bookings") ?? "[]");
      const all = [...stored, ...session];
      if (user?.id) {
        userBookingsCount = all.filter((b: any) => b.userId === user.id).length;
      }
    } catch {}
    const svcMap: Record<string, "flight" | "bus" | "hotel" | "holiday"> = {
      flight: "flight", bus: "bus", hotel: "hotel", package: "holiday",
    };
    return { phone, userBookingsCount, service_type: svcMap[bookingType] };
  }, [user, bookingType]);

  function applyCoupon(codeOverride?: string) {
    const code = (codeOverride ?? couponInput).trim().toUpperCase();
    if (!code) return;
    if (codeOverride) setCouponInput(codeOverride);
    const result = validateCoupon(code, displayedBasePrice + convenienceFeeAmount, couponContext);
    if (result.ok) {
      setAppliedCoupon(result.coupon);
      setAppliedDiscount(result.discountAmount);
      setCouponStatus("valid");
      toast({
        title: "Coupon applied!",
        description: `${result.coupon.code} — ₹${result.discountAmount.toLocaleString("en-IN")} off`,
      });
    } else {
      setAppliedCoupon(null);
      setAppliedDiscount(0);
      setCouponStatus("invalid");
      toast({ variant: "destructive", title: result.error, description: `Code: "${code}"` });
    }
  }
  function removeCoupon() {
    setAppliedCoupon(null);
    setAppliedDiscount(0);
    setCouponInput("");
    setCouponStatus("idle");
  }

  function handlePayment() {
    // Check authentication first
    if (!isAuthenticated || !user) {
      toast({
        variant: "destructive",
        title: "Login Required",
        description: "Please login to complete your booking",
      });
      return;
    }

    form.trigger().then((isValid) => {
      if (!isValid) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Please fill all required fields correctly.",
        });
        return;
      }
      
      // Show payment options dialog
      setShowPaymentDialog(true);
    });  }  
  
  function handlePaymentMethodSelected(method: "card" | "upi" | "wallet" | "emi", emiTenure?: number) {
    const values = form.getValues();
    const phone = `${values.passengerDetails[0].countryCode}${values.passengerDetails[0].phone}`;

    // First-time-only coupon: validate before processing payment
    if (appliedCoupon?.firstTimeOnly) {
      const check = checkFirstTimeUsage(appliedCoupon.code, phone);
      if (!check.ok) {
        toast({ variant: "destructive", title: check.error, description: "Remove the coupon to continue." });
        setShowPaymentDialog(false);
        return;
      }
    }

    setIsProcessingPayment(true);

    // Simulate payment processing for all methods
    setTimeout(() => {
      saveBookingWithPayment(values, method, "paid", undefined, emiTenure);

      // Record coupon usage (always, for analytics + first-time enforcement)
      if (appliedCoupon) {
        recordCouponUsage(appliedCoupon.code, phone);
      }

      setIsProcessingPayment(false);
      setShowPaymentDialog(false);

      toast({
        title: "Payment Successful! 🎉",
        description: `Booking confirmed using ${method.toUpperCase()}. Redirecting...`,
      });

      setTimeout(() => {
        setLocation("/bookings?success=true");
      }, 1000);
    }, 1500);
  }

  function saveBookingWithPayment(
    values: z.infer<typeof formSchema>,
    method: string,
    status: string,
    paymentId?: string,
    emiTenure?: number
  ) {
    // Ensure we have user ID
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "User not authenticated. Please login again.",
      });
      return;
    }    const booking = {
      id: `BK${Date.now()}`,
      userId: user.id,
      type: bookingType,
      status: status === "paid" ? "confirmed" : "pending",
      bookingDate: new Date().toISOString(),
      travelDate: values.travelDate,
      amount: finalPrice,
      customerName: values.passengerDetails[0].name,
      customerEmail: values.passengerDetails[0].email,
      customerPhone: `${values.passengerDetails[0].countryCode}${values.passengerDetails[0].phone}`,
      customerGender: values.passengerDetails[0].gender,
      passengers: values.passengers,
      passengerDetails: values.passengerDetails.map(p => ({
        ...p,
        phone: `${p.countryCode}${p.phone}`,
      })),
      paymentMethod: method as 'card' | 'upi' | 'wallet' | 'emi',
      paymentId: paymentId,
      title,
      referenceId,
      couponCode: appliedCoupon?.code,
      selectedSeats: selectedSeats.length > 0 ? selectedSeats : undefined,
      details: {
        title,
        passengers: values.passengers,
        pricePerUnit,
        rawBaseAmount: rawBasePrice,
        markupAmount: hiddenMarkupAmount,
        baseAmount: displayedBasePrice,
        convenienceFee: convenienceFeeAmount,
      },
      ...(method === "emi" && emiTenure ? { 
        emiDetails: {
          tenure: emiTenure,
          monthlyAmount: Math.ceil(finalPrice / emiTenure),
          processingFee: finalPrice * 0.02,
        }
      } : {}),
    };

    // Save to backend API (wrap in data object as required by the API)
    createBooking.mutate({ data: booking } as any, {
      onSuccess: (_response: unknown) => {
        toast({
          title: "Booking Confirmed! 🎉",
          description: `Your booking ID is ${booking.id}`,
        });
      },
      onError: (_error: unknown) => {
        toast({
          variant: "destructive",
          title: "Booking Failed",
          description: "Failed to save booking. Please try again.",
        });
      },
    });
  }return (
    <>
      <Card className="w-full shadow-lg border-primary/10">
        <CardHeader className="bg-muted/50 border-b">
          <CardTitle className="text-xl">Book {title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
        {!isAuthenticated && (
          <Alert className="mb-6 border-orange-200 bg-orange-50">
            <ShieldAlert className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div className="flex flex-col gap-3">
                <p className="font-semibold">Login required to complete booking</p>
                <p className="text-sm">You need to be logged in to proceed with payment and complete your booking.</p>
                <Link href="/login">
                  <Button variant="default" size="sm" className="w-full sm:w-auto">
                    <LogIn className="w-4 h-4 mr-2" />
                    Go to Login
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        )}        <Form {...form}>
          <form className="space-y-6">
            {/* Number of Passengers and Travel Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="passengers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Passengers</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="travelDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Travel Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Dynamic Passenger Details */}
            {Array.from({ length: passengersCount || 1 }, (_, index) => (
              <Card key={index} className="border-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Passenger {index + 1} Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`passengerDetails.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`passengerDetails.${index}.gender`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />                    <FormField
                      control={form.control}
                      name={`passengerDetails.${index}.age`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={120}
                              placeholder="Enter age"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />                  </div>

                  <FormField
                    control={form.control}
                    name={`passengerDetails.${index}.email`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="Enter email address" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Phone Number</Label>
                    <div className="flex gap-2">
                      <FormField
                        control={form.control}
                        name={`passengerDetails.${index}.countryCode`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <SelectTrigger className="w-[110px]">
                                  <SelectValue placeholder="Code" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="+91">🇮🇳 +91</SelectItem>
                                  <SelectItem value="+1">🇺🇸 +1</SelectItem>
                                  <SelectItem value="+44">🇬🇧 +44</SelectItem>
                                  <SelectItem value="+61">🇦🇺 +61</SelectItem>
                                  <SelectItem value="+86">🇨🇳 +86</SelectItem>
                                  <SelectItem value="+81">🇯🇵 +81</SelectItem>
                                  <SelectItem value="+82">🇰🇷 +82</SelectItem>
                                  <SelectItem value="+65">🇸🇬 +65</SelectItem>
                                  <SelectItem value="+971">🇦🇪 +971</SelectItem>
                                  <SelectItem value="+966">🇸🇦 +966</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`passengerDetails.${index}.phone`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input 
                                type="tel" 
                                placeholder="1234567890" 
                                maxLength={10}
                                {...field}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`passengerDetails.${index}.phone`}
                      render={() => (
                        <FormItem>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}            {/* Seat Selection - Only for flights, buses, and hotels */}
            {(bookingType === "flight" || bookingType === "bus" || bookingType === "hotel") && (
              <div className="my-6">
                <SeatSelection
                  type={bookingType}
                  maxSeats={passengersCount || 1}
                  selectedSeats={selectedSeats}
                  onSeatsChange={setSelectedSeats}
                  pricePerSeat={bookingType === "hotel" ? pricePerUnit : undefined}
                  passengerGenders={form.watch("passengerDetails").map(p => p.gender)}
                />
              </div>
            )}

            <div className="space-y-3">
              {/* Available Offers */}
              {couponStatus !== "valid" && (
                <AvailableCoupons
                  bookingAmount={displayedBasePrice + convenienceFeeAmount}
                  context={couponContext}
                  onApply={(code) => applyCoupon(code)}
                  appliedCode={appliedCoupon?.code}
                />
              )}

              {/* Manual coupon entry */}
              <div className="space-y-1.5">
                <Label>Have a Coupon Code?</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Enter coupon code"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponStatus("idle"); }}
                      className="pl-9 font-mono uppercase"
                      disabled={couponStatus === "valid"}
                    />
                  </div>
                  {couponStatus === "valid" ? (
                    <Button type="button" variant="outline" onClick={removeCoupon} className="text-destructive border-destructive/40">
                      Remove
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => applyCoupon()}>
                      Apply
                    </Button>
                  )}
                </div>
                {couponStatus === "valid" && appliedCoupon && (
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> {appliedCoupon.code} applied — ₹{appliedDiscount.toLocaleString("en-IN")} off
                  </p>
                )}
                {couponStatus === "invalid" && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <XCircle className="w-3 h-3" /> Invalid coupon code
                  </p>
                )}
              </div>
            </div>

            <div className="mt-2 p-4 bg-muted/30 rounded-lg border space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Base Price ({passengersCount || 1}×)</span>
                <span>₹{displayedBasePrice.toLocaleString("en-IN")}</span>
              </div>
              {convenienceFeeAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Convenience Fee</span>
                  <span>+₹{convenienceFeeAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Coupon Discount</span>
                  <span>-₹{discount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Total Price</p>
                  <p className="text-2xl font-bold text-primary">₹{finalPrice.toLocaleString("en-IN")}</p>
                </div>                <Button
                  type="button"
                  size="lg"
                  onClick={handlePayment}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                  ) : (
                    "Pay Now"
                  )}
                </Button>
              </div>
            </div>          </form>
        </Form>
      </CardContent>
    </Card>

      {/* Payment Options Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Your Payment</DialogTitle>
          </DialogHeader>
          {isProcessingPayment ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-semibold">Processing Payment...</p>
              <p className="text-sm text-muted-foreground">Please wait while we confirm your booking</p>
            </div>          ) : (
            <PaymentOptions
              userId={user?.id || null}
              totalAmount={finalPrice}
              onPaymentSelect={handlePaymentMethodSelected}
              bookingDetails={{
                bookingType,
                title,
                passengerName: form.getValues("passengerDetails.0.name"),
                passengerEmail: form.getValues("passengerDetails.0.email"),
                passengerPhone: form.getValues("passengerDetails.0.phone"),
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
