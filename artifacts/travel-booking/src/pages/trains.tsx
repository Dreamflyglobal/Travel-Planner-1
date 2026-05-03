import { Navbar } from "@/components/navbar";
import { Train } from "lucide-react";

export default function Trains() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mb-6">
          <Train className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Train Booking</h1>
        <p className="text-lg text-muted-foreground mb-2">Coming Soon</p>
        <p className="text-sm text-muted-foreground max-w-md">
          IRCTC-powered train booking is on its way. Search trains, check PNR status, and book tickets — all in one place.
        </p>
      </div>
    </div>
  );
}
