"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CardDemoPage() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold font-mono tracking-tight">
            Card Component Showcase
          </h1>
          <p className="text-muted-foreground text-lg">
            Explore different variants and compositions of the Card component
          </p>
        </div>

        {/* Variants Grid */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold font-mono">Variants</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Default */}
            <Card className="group">
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
                <CardDescription>
                  Standard card with subtle shadow and border
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Perfect for general content containers with clean, minimal
                  styling.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Learn More
                </Button>
              </CardFooter>
            </Card>

            {/* Elevated */}
            <Card variant="elevated" className="group">
              <CardHeader>
                <CardTitle>Elevated Card</CardTitle>
                <CardDescription>
                  Enhanced depth with stronger shadows
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Ideal for important content that needs visual prominence.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Explore
                </Button>
              </CardFooter>
            </Card>

            {/* Glow */}
            <Card variant="glow" className="group">
              <CardHeader>
                <CardTitle>Glow Card</CardTitle>
                <CardDescription>
                  Technical aesthetic with subtle glow effect
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Perfect for highlighting technical features or AI-powered
                  insights.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="default">
                  View Details
                </Button>
              </CardFooter>
            </Card>

            {/* Glass */}
            <Card variant="glass" className="group">
              <CardHeader>
                <CardTitle>Glass Card</CardTitle>
                <CardDescription>
                  Frosted glass effect with backdrop blur
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Modern glassmorphism design for overlay content.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Preview
                </Button>
              </CardFooter>
            </Card>

            {/* Bordered */}
            <Card variant="bordered" className="group">
              <CardHeader>
                <CardTitle>Bordered Card</CardTitle>
                <CardDescription>
                  Emphasized border with hover interaction
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Great for interactive cards that respond to user actions.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Interact
                </Button>
              </CardFooter>
            </Card>

            {/* Ghost */}
            <Card variant="ghost" className="group">
              <CardHeader>
                <CardTitle>Ghost Card</CardTitle>
                <CardDescription>
                  Transparent with subtle hover effect
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Minimal visual weight, perfect for secondary content.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="ghost">
                  Discover
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Sizes */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold font-mono">Sizes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card size="sm" variant="glow">
              <CardHeader>
                <CardTitle className="text-base">Small</CardTitle>
                <CardDescription className="text-xs">
                  Compact spacing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  For tight spaces
                </p>
              </CardContent>
            </Card>

            <Card size="default" variant="glow">
              <CardHeader>
                <CardTitle>Default</CardTitle>
                <CardDescription>Standard spacing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Balanced padding</p>
              </CardContent>
            </Card>

            <Card size="lg" variant="glow">
              <CardHeader>
                <CardTitle className="text-2xl">Large</CardTitle>
                <CardDescription>Generous spacing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">More breathing room</p>
              </CardContent>
            </Card>

            <Card size="xl" variant="glow">
              <CardHeader>
                <CardTitle className="text-2xl">Extra Large</CardTitle>
                <CardDescription>Maximum spacing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Premium content display
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Complex Example */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold font-mono">
            Complex Composition
          </h2>
          <Card variant="elevated" size="lg" className="group">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="text-3xl">AI Code Review</CardTitle>
                  <CardDescription className="text-base">
                    Comprehensive analysis powered by advanced language models
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
                  <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                  <span>ACTIVE</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 p-4 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-2xl font-bold font-mono">247</div>
                  <div className="text-sm text-muted-foreground">
                    Reviews Completed
                  </div>
                </div>
                <div className="space-y-2 p-4 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-2xl font-bold font-mono">98.5%</div>
                  <div className="text-sm text-muted-foreground">
                    Accuracy Score
                  </div>
                </div>
                <div className="space-y-2 p-4 rounded-lg bg-muted/30 border border-border/50">
                  <div className="text-2xl font-bold font-mono">1,432</div>
                  <div className="text-sm text-muted-foreground">
                    Issues Detected
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold font-mono text-sm">
                  Recent Activity
                </h4>
                <div className="space-y-2">
                  {[
                    "Fixed critical security vulnerability in auth.ts",
                    "Optimized database query performance",
                    "Improved error handling in API routes",
                  ].map((activity, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 text-sm p-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <div className="size-1.5 rounded-full bg-primary" />
                      <span className="text-muted-foreground">{activity}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between">
              <span className="text-xs">Last updated: 2 minutes ago</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  View Report
                </Button>
                <Button size="sm">Start New Review</Button>
              </div>
            </CardFooter>
          </Card>
        </section>

        {/* Spacing Variants */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold font-mono">
            Spacing Variants
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card spacing="compact" variant="bordered">
              <CardHeader>
                <CardTitle>Compact</CardTitle>
                <CardDescription>Tight vertical spacing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Minimal space between sections
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Action
                </Button>
              </CardFooter>
            </Card>

            <Card spacing="default" variant="bordered">
              <CardHeader>
                <CardTitle>Default</CardTitle>
                <CardDescription>Standard vertical spacing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Balanced space between sections
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Action
                </Button>
              </CardFooter>
            </Card>

            <Card spacing="relaxed" variant="bordered">
              <CardHeader>
                <CardTitle>Relaxed</CardTitle>
                <CardDescription>Generous vertical spacing</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Ample space between sections
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Action
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
