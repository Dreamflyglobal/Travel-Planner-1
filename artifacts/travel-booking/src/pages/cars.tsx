import { Navbar } from "@/components/navbar";
import { Car } from "lucide-react";

export default function Cars() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Car className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Car Rentals</h1>
        <p className="text-lg text-muted-foreground mb-2">Car Rentals coming soon</p>
        <p className="text-sm text-muted-foreground max-w-md">
          We're working on bringing you the best car rental deals. Stay tuned!
        </p>
      </div>
    </div>
  );
}
