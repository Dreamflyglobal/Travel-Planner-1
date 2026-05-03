import { Navbar } from "@/components/navbar";
import { Compass } from "lucide-react";

export default function Activities() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Compass className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Activities</h1>
        <p className="text-lg text-muted-foreground mb-2">Activities coming soon</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Exciting experiences and local activities are on their way. Check back soon!
        </p>
      </div>
    </div>
  );
}
