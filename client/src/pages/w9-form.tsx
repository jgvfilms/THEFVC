import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, AlertCircle } from "lucide-react";
import type { W9Form } from "@shared/schema";
import { Link } from "wouter";

const TAX_CLASSIFICATIONS = [
  "Individual/sole proprietor",
  "C-Corporation",
  "S-Corporation",
  "Partnership",
  "Limited liability company (LLC)",
  "Limited liability company (LLC) - taxed as partnership",
  "Limited liability company (LLC) - taxed as corporation",
  "Other",
];

export function W9FormPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["w9"],
    queryFn: () => apiRequestJson<W9Form>("GET", "/api/w9"),
    retry: false,
  });

  const [form, setForm] = useState({
    fullName: existing?.fullName || "",
    businessName: existing?.businessName || "",
    taxClassification: existing?.taxClassification || "",
    einOrSsn: "", // Never pre-fill tax ID — user must re-enter for security
    address: existing?.address || "",
    city: existing?.city || "",
    state: existing?.state || "",
    zipCode: existing?.zipCode || "",
  });

  // Update form when existing data loads (but never pre-fill tax ID for security)
  if (existing && !form.fullName) {
    setForm({
      fullName: existing.fullName,
      businessName: existing.businessName || "",
      taxClassification: existing.taxClassification,
      einOrSsn: "", // Never pre-fill — user must re-enter
      address: existing.address,
      city: existing.city,
      state: existing.state,
      zipCode: existing.zipCode,
    });
  }

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Validation
    const errors: string[] = [];
    if (!form.fullName.trim()) errors.push("Legal name is required");
    if (!form.taxClassification) errors.push("Tax classification is required");
    if (!form.einOrSsn.trim()) errors.push("Tax ID (EIN or SSN) is required");
    if (!form.address.trim()) errors.push("Address is required");
    if (!form.city.trim()) errors.push("City is required");
    if (!form.state.trim()) errors.push("State is required");
    if (!form.zipCode.trim()) errors.push("ZIP code is required");

    if (errors.length > 0) {
      toast({
        title: "Validation errors",
        description: errors.join("; "),
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      await apiRequestJson("POST", "/api/w9", form);
      toast({
        title: "W-9 saved",
        description: "Your tax information has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["w9"] });
    } catch (err) {
      toast({
        title: "Save failed",
        description: "Could not save W-9 form. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <Card>
          <CardContent className="py-12">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold">W-9 Tax Form</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit your tax information to receive payments. Your data is encrypted and stored securely.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Tax Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="fullName">Legal Name *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => handleChange("fullName", e.target.value)}
                placeholder="As it appears on your tax return"
                data-testid="input-full-name"
              />
            </div>

            <div>
              <Label htmlFor="businessName">Business Name (if different)</Label>
              <Input
                id="businessName"
                value={form.businessName}
                onChange={(e) => handleChange("businessName", e.target.value)}
                placeholder="Optional"
                data-testid="input-business-name"
              />
            </div>

            <div>
              <Label htmlFor="taxClassification">Tax Classification *</Label>
              <Select
                value={form.taxClassification}
                onValueChange={(v) => handleChange("taxClassification", v)}
                data-testid="select-tax-classification"
              >
                <SelectTrigger id="taxClassification">
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  {TAX_CLASSIFICATIONS.map((tc) => (
                    <SelectItem key={tc} value={tc}>{tc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="einOrSsn">Tax ID (EIN or SSN) *</Label>
              <Input
                id="einOrSsn"
                value={form.einOrSsn}
                onChange={(e) => handleChange("einOrSsn", e.target.value)}
                placeholder="e.g. 12-3456789 or 123-45-6789"
                data-testid="input-tax-id"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your tax ID is encrypted and only used for 1099 reporting.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="address">Street Address *</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="123 Main St, Apt 4B"
                data-testid="input-address"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  data-testid="input-city"
                />
              </div>
              <div>
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={form.state}
                  onChange={(e) => handleChange("state", e.target.value)}
                  placeholder="e.g. NY"
                  data-testid="input-state"
                />
              </div>
              <div>
                <Label htmlFor="zipCode">ZIP Code *</Label>
                <Input
                  id="zipCode"
                  value={form.zipCode}
                  onChange={(e) => handleChange("zipCode", e.target.value)}
                  data-testid="input-zip"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-4 border-t">
          <Link href="/payments">
            <Button variant="outline" size="sm" data-testid="button-cancel-w9">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-save-w9"
          >
            {isSubmitting ? "Saving..." : (
              <>
                <Save className="h-3 w-3 mr-1" />
                Save W-9 Form
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
