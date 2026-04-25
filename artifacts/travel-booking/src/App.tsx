import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { BrandingProvider } from "@/contexts/branding-context";
import { SiteSettingsProvider } from "@/contexts/site-settings-context";
import { AdminGuard } from "@/components/admin-guard";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);
  return null;
}

import Home from "@/pages/home";
import AdminDashboard from "@/pages/admin";
import MasterAdminLogin from "@/pages/master-admin-login";
import AgentDashboard from "@/pages/agent-dashboard";
import Login from "@/pages/login";
import AgentLogin from "@/pages/agent-login";
import Signup from "@/pages/signup";
import Flights from "@/pages/flights";
import FlightResults from "@/pages/flight-results";
import FlightBooking from "@/pages/flight-booking";
import FlightDetail from "@/pages/flight-detail";
import Buses from "@/pages/buses";
import BusResults from "@/pages/bus-results";
import BusBooking from "@/pages/bus-booking";
import BusSeatSelection from "@/pages/bus-seat-selection";
import BusDetail from "@/pages/bus-detail";
import Hotels from "@/pages/hotels";
import HotelResults from "@/pages/hotel-results";
import HotelDetail from "@/pages/hotel-detail";
import HotelBooking from "@/pages/hotel-booking";
import Packages from "@/pages/packages";
import PackageDetail from "@/pages/package-detail";
import PackageBooking from "@/pages/package-booking";
import Bookings from "@/pages/bookings";
import BookingDetail from "@/pages/booking-detail";
import SeatSelectionPage from "@/pages/seat-selection-page";
import PassengerDetailsPage from "@/pages/passenger-details-page";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import PaymentSuccess from "@/pages/payment-success";
import PaymentFailed from "@/pages/payment-failed";
import NotFound from "@/pages/not-found";
import BookingPayment from "@/pages/booking-payment";
import AdminCRM from "@/pages/admin/crm";
import AdminLeads from "@/pages/admin/leads";
import AdminPackages from "@/pages/admin/packages";
import AdminEnquiries from "@/pages/admin/enquiries";
import AdminProfit from "@/pages/admin/profit";
import StaffDashboard from "@/pages/staff-dashboard";
import StaffCRM from "@/pages/staff/crm";
import CancellationPolicy from "@/pages/cancellation-policy";
import RefundPolicy from "@/pages/refund-policy";
import Terms from "@/pages/terms";
import PrivacyPolicy from "@/pages/privacy-policy";
import About from "@/pages/about";
import Contact from "@/pages/contact";
import AdminInvoices from "@/pages/admin/invoices";
import AdminUsers from "@/pages/admin/users";
import AdminStaffIncentives from "@/pages/admin/staff-incentives";
import AdminSettings from "@/pages/admin/settings";
import StaffLogin from "@/pages/staff-login";
import AgentSignup from "@/pages/agent-signup";
import InvoiceView from "@/pages/invoice-view";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry failed queries only once (instead of 3 times default)
      retry: 1,
      // Suppress React Query refetch on window focus
      refetchOnWindowFocus: false,
      // Stale time - data is considered fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/agent-login" component={AgentLogin} />
      <Route path="/signup" component={Signup} />
      <Route path="/agent-signup" component={AgentSignup} />
      <Route path="/flights" component={Flights} />
      <Route path="/flights/results" component={FlightResults} />
      <Route path="/booking/flight" component={FlightBooking} />
      <Route path="/booking/payment" component={BookingPayment} />
      <Route path="/master-admin">
        <Redirect to="/master-admin/login" />
      </Route>
      <Route path="/master-admin/login" component={MasterAdminLogin} />
      <Route path="/master-admin/dashboard">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>
      <Route path="/master-admin/agents">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>
      <Route path="/master-admin/revenue">
        <AdminGuard><AdminProfit /></AdminGuard>
      </Route>
      <Route path="/master-admin/leads">
        <AdminGuard><AdminLeads /></AdminGuard>
      </Route>
      <Route path="/master-admin/enquiries">
        <AdminGuard><AdminEnquiries /></AdminGuard>
      </Route>
      <Route path="/agent" component={AgentDashboard} />
      <Route path="/flights/:id" component={FlightDetail} />
      <Route path="/buses" component={Buses} />
      <Route path="/bus/results" component={BusResults} />
      <Route path="/bus/booking" component={BusBooking} />
      <Route path="/bus/seat-selection" component={BusSeatSelection} />
      <Route path="/buses/:id" component={BusDetail} />
      <Route path="/hotels" component={Hotels} />
      <Route path="/hotels/results" component={HotelResults} />
      <Route path="/hotels/booking" component={HotelBooking} />
      <Route path="/hotels/:id" component={HotelDetail} />
      <Route path="/packages" component={Packages} />
      <Route path="/packages/booking" component={PackageBooking} />
      <Route path="/packages/:id" component={PackageDetail} />
      <Route path="/booking/seat-selection/:type/:id" component={SeatSelectionPage} />
      <Route path="/booking/passenger-details" component={PassengerDetailsPage} />
      <Route path="/bookings" component={Bookings} />
      <Route path="/bookings/:id" component={BookingDetail} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-failed" component={PaymentFailed} />
      <Route path="/admin/crm">
        <Redirect to="/master-admin/crm" />
      </Route>
      <Route path="/master-admin/crm">
        <AdminGuard><AdminCRM /></AdminGuard>
      </Route>
      <Route path="/admin/packages">
        <AdminGuard><AdminPackages /></AdminGuard>
      </Route>
      <Route path="/master-admin/packages">
        <AdminGuard><AdminPackages /></AdminGuard>
      </Route>
      <Route path="/admin/leads">
        <AdminGuard><AdminLeads /></AdminGuard>
      </Route>
      <Route path="/admin/enquiries">
        <AdminGuard><AdminEnquiries /></AdminGuard>
      </Route>
      <Route path="/admin/profit">
        <AdminGuard><AdminProfit /></AdminGuard>
      </Route>
      <Route path="/staff" component={StaffDashboard} />
      <Route path="/staff/dashboard" component={StaffDashboard} />
      <Route path="/staff/crm" component={StaffCRM} />
      <Route path="/staff-login" component={StaffLogin} />
      <Route path="/cancellation-policy" component={CancellationPolicy} />
      <Route path="/refund-policy" component={RefundPolicy} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/master-admin/invoices" component={AdminInvoices} />
      <Route path="/master-admin/staff-incentives">
        <AdminGuard><AdminStaffIncentives /></AdminGuard>
      </Route>
      <Route path="/master-admin/settings">
        <AdminGuard><AdminSettings /></AdminGuard>
      </Route>
      <Route path="/master-admin/users">
        <AdminGuard><AdminUsers /></AdminGuard>
      </Route>
      <Route path="/invoice/:bookingId" component={InvoiceView} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <SiteSettingsProvider>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <ScrollToTop />
              <Router />
              <PushNotificationPrompt />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
        </SiteSettingsProvider>
      </BrandingProvider>
    </QueryClientProvider>
  );
}

export default App;
