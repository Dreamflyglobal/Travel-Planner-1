import { Layout } from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Plane, Bus, Building2, Map, ExternalLink, AlertCircle, LogIn, Download, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useBranding } from "@/contexts/branding-context";
import { migrateBookingTitles } from "@/lib/migrate-bookings";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Bookings() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();
  
  // Fetch bookings filtered by current user via GET /api/bookings?userId=&phone=
  const { data: bookings, isLoading, refetch } = useQuery({
    queryKey: ["bookings", user?.id, (user as any)?.phone, user?.email],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (user?.id) params.set("userId", String(user.id));
        if ((user as any)?.phone) params.set("phone", String((user as any).phone));
        if (user?.email) params.set("email", String(user.email));
        const url = params.toString() ? `/api/bookings?${params.toString()}` : "/api/bookings";
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch bookings");
        return res.json();
      } catch (e) {
        console.error("Fetch bookings failed:", e);
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  // Migrate old bookings to add missing titles
  useEffect(() => {
    if (isAuthenticated) {
      const { migrated } = migrateBookingTitles();
      if (migrated > 0) {
        // Refetch bookings after migration
        setTimeout(() => refetch(), 100);
      }
    }
  }, [isAuthenticated, refetch]);

  // Show success message if coming from a successful booking
  useEffect(() => {
    if (!isAuthenticated) return; // Skip if not authenticated
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast({
        title: "Booking Confirmed! 🎉",
        description: "Your booking has been successfully created.",
        duration: 5000,
      });
      // Clear the query parameter
      window.history.replaceState({}, '', '/bookings');
      // Refetch bookings to show the new one
      refetch();
    }
  }, [toast, refetch, isAuthenticated]);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="pt-16 pb-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center">
                <LogIn className="w-10 h-10 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Login Required</h2>
              <p className="text-muted-foreground mb-6">
                Please login to view your bookings
              </p>
              <Button 
                onClick={() => setLocation("/login?returnTo=/bookings")}
                className="w-full"
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Bookings already filtered by userId from the API
  const bookingsArray = Array.isArray(bookings) ? bookings : [];

  const handleCancel = async (bookingId: string | number | undefined) => {
    if (!bookingId) {
      console.error('❌ Cancel failed: No booking ID provided');
      toast({
        variant: "destructive",
        title: "Cannot Cancel",
        description: "Booking ID is missing. Please try again.",
      });
      return;
    }
    
    
    try {
      // Call API to cancel booking (MSW will intercept this)
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        toast({
          title: "Booking Cancelled",
          description: "Your booking has been successfully cancelled.",
        });
        // Refetch bookings
        refetch();
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Cancel failed with status:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('❌ Cancel error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cancel booking. Please try again.",
      });
    }
  };

  const handleDownloadTicket = (booking: any) => {
    const bid = booking.id || booking.bookingId || booking.referenceId;
    const invoiceId = String(booking.bookingId || `BKG-${bid}`);
    window.open(`/invoice/${encodeURIComponent(invoiceId)}?download=1`, "_blank");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'flight': return <Plane className="w-5 h-5" />;
      case 'bus': return <Bus className="w-5 h-5" />;
      case 'hotel': return <Building2 className="w-5 h-5" />;
      case 'package': return <Map className="w-5 h-5" />;
      default: return <Map className="w-5 h-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'paid':
        return <Badge className="bg-green-500 hover:bg-green-600">Ticket Confirmed</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 hover:bg-yellow-500/30">Pending</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-blue-500/20 text-blue-700 hover:bg-blue-500/30">Booking in Progress</Badge>;
      case 'booking_failed':
      case 'failed':
        return <Badge variant="destructive" className="bg-red-600">Booking Failed</Badge>;
      case 'refund_initiated':
      case 'refund_processing':
        return <Badge className="bg-blue-600 hover:bg-blue-700">Refund Initiated</Badge>;
      case 'refunded':
        return <Badge className="bg-indigo-600 hover:bg-indigo-700">Refunded</Badge>;
      case 'refund_failed':
        return <Badge variant="destructive" className="bg-orange-600">Refund Failed</Badge>;
      case 'payment_failed':
        return <Badge variant="destructive" className="bg-red-700">Payment Failed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Get gender-based color scheme
  const getGenderColors = (gender?: string) => {
    switch (gender?.toLowerCase()) {
      case 'male':
        return {
          border: 'border-l-4 border-l-blue-500',
          bg: 'bg-blue-50/30',
          header: 'bg-blue-50/50',
          icon: 'bg-blue-100 text-blue-600',
          accent: 'text-blue-600'
        };
      case 'female':
        return {
          border: 'border-l-4 border-l-pink-500',
          bg: 'bg-pink-50/30',
          header: 'bg-pink-50/50',
          icon: 'bg-pink-100 text-pink-600',
          accent: 'text-pink-600'
        };
      case 'other':
        return {
          border: 'border-l-4 border-l-purple-500',
          bg: 'bg-purple-50/30',
          header: 'bg-purple-50/50',
          icon: 'bg-purple-100 text-purple-600',
          accent: 'text-purple-600'
        };
      default:
        return {
          border: '',
          bg: '',
          header: 'bg-muted/10',
          icon: 'bg-primary/10 text-primary',
          accent: 'text-primary'
        };
    }
  };

  return (
    <Layout>
      <div className="bg-muted/30 py-8 md:py-12 border-b">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight">My Bookings</h1>
          <p className="text-muted-foreground mt-1 md:mt-2 text-sm md:text-lg">Manage your upcoming trips and past travel history.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : !bookingsArray || bookingsArray.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-2xl border shadow-sm max-w-2xl mx-auto">
            <Map className="w-16 h-16 mx-auto text-muted-foreground/30 mb-6" />
            <h3 className="text-2xl font-bold mb-2">No bookings yet</h3>
            <p className="text-muted-foreground mb-8">It looks like you haven't booked any trips. Ready to start an adventure?</p>
            <Button asChild size="lg" className="rounded-full px-8">
              <Link href="/">Explore Destinations</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {bookingsArray.sort((a: any,b: any) => new Date(b.bookingDate || b.createdAt || b.timestamp || 0).getTime() - new Date(a.bookingDate || a.createdAt || a.timestamp || 0).getTime()).map((booking: any) => {
              const bookingStatus = booking.status || booking.paymentStatus || 'pending';
              const bookingId = booking.id || booking.bookingId || booking.referenceId;
              const bookingType = booking.type || booking.bookingType || 'package';
              const genderColors = getGenderColors(booking.customerGender);
              
              return (
              <Card key={booking.id || booking.bookingId} className={`overflow-hidden transition-all shadow-sm hover:shadow-md ${genderColors.border} ${genderColors.bg} ${bookingStatus === 'cancelled' ? 'opacity-75' : ''}`}>
                <CardHeader className={`pb-4 border-b ${genderColors.header} flex flex-row items-center justify-between space-y-0`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${bookingStatus === 'cancelled' ? 'bg-muted text-muted-foreground' : genderColors.icon}`}>
                      {getIcon(bookingType)}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                        {bookingType.toUpperCase()} • ID: #{booking.id || booking.referenceId}
                      </p>
                      <CardTitle className="text-lg line-clamp-2">
                        {sanitizeBookingTitle(booking.title || booking.details?.title) || `${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)} Booking #${booking.id || booking.referenceId}`}
                      </CardTitle>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(bookingStatus)}
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Travel Date</p>
                      <p className="font-semibold text-foreground">
                        {format(new Date(booking.travelDate), "MMM do, yyyy")}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{bookingType === 'hotel' ? 'Guests' : 'Passengers'}</p>
                      <p className="font-semibold text-foreground">{booking.passengers}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{bookingType === 'hotel' ? 'Guest Name' : 'Customer Name'}</p>
                      <p className="font-semibold text-foreground truncate">{booking.customerName || booking.passengerName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                      <p className="font-bold text-primary text-lg">₹{booking.amount || booking.totalAmount || booking.totalPrice}</p>
                    </div>
                    
                    {/* Seat Numbers Display */}
                    {booking.selectedSeats && booking.selectedSeats.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          {bookingType === 'hotel' ? 'Room Numbers' : 'Seat Numbers'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {booking.selectedSeats.map((seat: string, index: number) => (
                            <Badge 
                              key={`${seat}-${index}`} 
                              variant="secondary" 
                              className="px-2 py-1 text-xs font-mono"
                            >
                              {seat}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {booking.paymentMethod && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
                        <p className="font-semibold text-foreground uppercase">{booking.paymentMethod}</p>
                      </div>
                    )}
                    {booking.emiDetails && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">EMI</p>
                        <p className="font-semibold text-foreground">{booking.emiDetails.tenure} months @ ₹{booking.emiDetails.monthlyAmount}/mo</p>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/5 border-t p-4 flex flex-wrap gap-2 justify-between items-center">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/bookings/${bookingId}`}>
                        View Details <ExternalLink className="w-3 h-3 ml-2" />
                      </Link>
                    </Button>

                    {/* Download PDF — available for all confirmed bookings */}
                    {bookingStatus !== 'cancelled' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadTicket(booking)}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
                      >
                        <Download className="w-3.5 h-3.5 mr-1.5" />Download PDF
                      </Button>
                    )}
                  </div>
                  
                  {bookingStatus !== 'cancelled' && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          Cancel
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center text-destructive">
                            <AlertCircle className="w-5 h-5 mr-2" /> Cancel Booking
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to cancel this booking? This action cannot be undone. 
                            Depending on the cancellation policy, you may be charged a fee.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                          <AlertDialogAction 
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleCancel(bookingId)}
                          >
                            Yes, Cancel Booking
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardFooter>
              </Card>
            )})}
          </div>
        )}
      </div>
    </Layout>
  );
}
