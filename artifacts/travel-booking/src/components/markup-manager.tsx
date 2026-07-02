import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, Percent, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { useMarkupContext } from "@/contexts/markup-context";

export function MarkupManager() {
  const [isOpen, setIsOpen] = useState(false);
  const { simpleMarkup, simpleMarkupType, saveSimpleMarkup } = useMarkupContext();
  const [markup, setMarkup] = useState(simpleMarkup);
  const [markupType, setMarkupType] = useState<"fixed" | "percentage">(simpleMarkupType);
  const { toast } = useToast();

  const saveMarkup = async () => {
    try {
      await saveSimpleMarkup(markup, markupType);
      toast({
        title: "Markup Saved!",
        description: `${markupType === "percentage" ? markup + "%" : "₹" + markup} markup will be applied to all bookings.`,
      });
      setIsOpen(false);
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message ?? "Could not save markup. Please try again.", variant: "destructive" });
    }
  };

  const resetMarkup = async () => {
    try {
      setMarkup(0);
      await saveSimpleMarkup(0, markupType);
      toast({
        title: "Markup Reset",
        description: "Markup has been removed from all bookings.",
      });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err?.message ?? "Could not reset markup. Please try again.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="w-4 h-4" />
          Markup Settings
          {markup > 0 && (
            <Badge variant="secondary" className="ml-1">
              {markupType === "percentage" ? `${markup}%` : `₹${markup}`}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-primary" />
            Markup Configuration
          </DialogTitle>
          <DialogDescription>
            Set a default markup to be applied on all bookings. This can be a fixed amount or a percentage.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Markup Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMarkupType("percentage")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  markupType === "percentage"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <Percent className="w-6 h-6 mx-auto mb-2 text-primary" />
                <div className="font-semibold text-sm">Percentage</div>
                <div className="text-xs text-muted-foreground">% of price</div>
              </button>
              <button
                type="button"
                onClick={() => setMarkupType("fixed")}
                className={`p-4 rounded-lg border-2 transition-all ${
                  markupType === "fixed"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-2xl mb-2 block">₹</span>
                <div className="font-semibold text-sm">Fixed Amount</div>
                <div className="text-xs text-muted-foreground">Flat fee</div>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="markup-value">
              {markupType === "percentage" ? "Markup Percentage" : "Markup Amount (₹)"}
            </Label>
            <div className="relative">
              <Input
                id="markup-value"
                type="number"
                min="0"
                max={markupType === "percentage" ? "100" : undefined}
                step={markupType === "percentage" ? "0.1" : "1"}
                value={markup}
                onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)}
                className="text-lg font-semibold pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                {markupType === "percentage" ? "%" : "₹"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {markupType === "percentage"
                ? "Enter a percentage between 0% and 100%"
                : "Enter a fixed amount in rupees"}
            </p>
          </div>

          {/* Preview */}
          <div className="bg-muted/50 rounded-lg p-4 border">
            <div className="text-sm font-semibold mb-2">Example Calculation:</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Price:</span>
                <span className="font-medium">₹10,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Markup:</span>
                <span className="font-medium text-primary">
                  {markupType === "percentage"
                    ? `₹${((10000 * markup) / 100).toFixed(2)}`
                    : `₹${markup.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-semibold">Total Price:</span>
                <span className="font-bold text-lg text-primary">
                  ₹
                  {markupType === "percentage"
                    ? (10000 + (10000 * markup) / 100).toFixed(2)
                    : (10000 + markup).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={resetMarkup} className="gap-2">
            <X className="w-4 h-4" />
            Reset
          </Button>
          <Button onClick={saveMarkup} className="gap-2">
            <Save className="w-4 h-4" />
            Save Markup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
