import { Navbar } from "@/components/navbar";
import { FileText } from "lucide-react";

export default function Visa() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        <div className="w-24 h-24 rounded-full bg-indigo-50 flex items-center justify-center mb-6">
          <FileText className="w-12 h-12 text-indigo-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Visa Assistance</h1>
        <p className="text-lg text-muted-foreground mb-2">Coming Soon</p>
        <p className="text-sm text-muted-foreground max-w-md mb-8">
          Hassle-free visa guidance for 100+ countries — document checklists, application tracking, and expert support, all in one place.
        </p>
        <a
          href="mailto:visa@dreamflyglobal.com"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Notify Me
        </a>
      </div>
    </div>
  );
}
