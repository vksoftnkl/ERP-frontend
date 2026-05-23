"use client";

import { useRouter } from "next/navigation";
import { notifyGlobalNavigationStart } from "@/lib/navigation/global-loader";
import ModalFormShowcase from "./modal-form-showcase";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardFoot,
  CardHead,
  CardTitle,
  Cluster,
  Container,
  Field,
  FieldHelp,
  Grid,
  Input,
  Kpi,
  Label,
  NavBar,
  NavLinks,
  Select,
  Shell,
  Sidebar,
  Split,
  Stack,
  Textarea,
} from "@/components/design-system";

export default function UiLibraryPage() {
  const router = useRouter();
  const navigate = (href: string) => {
    notifyGlobalNavigationStart();
    router.push(href);
  };

  return (
    <Shell>
      <Container size="wide" className="py-8">
        <Stack space="xl">
          <NavBar
            actions={
              <Cluster>
                <Button variant="secondary" size="sm">
                  Preview
                </Button>
                <Button size="sm">Publish</Button>
              </Cluster>
            }
          >
            <NavLinks>
              <button
                type="button"
                className="ui-navlink ui-navlink--active"
                onClick={() => navigate("/ui-library")}
              >
                Library
              </button>
              <button type="button" className="ui-navlink" onClick={() => navigate("/")}>
                Existing Home
              </button>
              <button type="button" className="ui-navlink" onClick={() => navigate("/dashboard")}>
                Dashboard
              </button>
            </NavLinks>
          </NavBar>

          <Split>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Tailwind + SCSS Custom UI Library</h1>
              <p className="mt-2 text-sm text-[var(--ds-text-muted)]">
                Layout primitives and reusable components with a token-driven design layer.
              </p>
            </div>
            <Cluster gap="sm">
              <Badge variant="info">v1.0</Badge>
              <Badge variant="success">Ready</Badge>
            </Cluster>
          </Split>

          <Grid min="15rem">
            <Kpi label="Orders Today" value="148" trend="+14.2%" trendDirection="up" />
            <Kpi label="Pending Invoices" value="23" trend="-2 from yesterday" trendDirection="down" />
            <Kpi label="Warehouse Fill" value="81%" trend="Stable" />
            <Kpi label="Cash Collected" value="$43,920" trend="+7.6%" trendDirection="up" />
          </Grid>

          <Sidebar side="end" width="22rem" gap="lg">
            <Stack space="lg">
              <Card>
                <CardHead>
                  <CardTitle>Component Playground</CardTitle>
                  <CardDescription>Card, buttons, fields, and alerts using shared primitives.</CardDescription>
                </CardHead>
                <CardBody>
                  <Stack space="md">
                    <Field>
                      <Label htmlFor="company">Company</Label>
                      <Input id="company" placeholder="VK Softwares Pvt Ltd" />
                    </Field>
                    <Field>
                      <Label htmlFor="module">Module</Label>
                      <Select id="module" defaultValue="sales">
                        <option value="sales">Sales</option>
                        <option value="purchase">Purchase</option>
                        <option value="inventory">Inventory</option>
                      </Select>
                      <FieldHelp>Every control is styleable using className while retaining base tokens.</FieldHelp>
                    </Field>
                    <Field>
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea id="notes" placeholder="Write implementation notes..." />
                    </Field>
                    <Cluster>
                      <Button>Save</Button>
                      <Button variant="secondary">Cancel</Button>
                      <Button variant="danger">Delete</Button>
                    </Cluster>
                  </Stack>
                </CardBody>
              </Card>

              <Alert kind="info" title="Tip">
                Use `components/library` exports to keep screens consistent across modules.
              </Alert>
            </Stack>

            <Stack space="lg">
              <Card>
                <CardHead>
                  <CardTitle>Layouts</CardTitle>
                  <CardDescription>Container, Stack, Cluster, Split, Grid, and Sidebar are included.</CardDescription>
                </CardHead>
                <CardBody>
                  <Stack space="sm">
                    <Cluster gap="sm">
                      <Badge>Container</Badge>
                      <Badge>Stack</Badge>
                      <Badge>Grid</Badge>
                      <Badge>Sidebar</Badge>
                      <Badge>Split</Badge>
                    </Cluster>
                    <Alert kind="success" title="Token Driven">
                      Components stay consistent across pages using shared design tokens.
                    </Alert>
                  </Stack>
                </CardBody>
                <CardFoot>
                  <Button variant="ghost" block>
                    View Token Source
                  </Button>
                </CardFoot>
              </Card>
            </Stack>
          </Sidebar>

          <ModalFormShowcase />
        </Stack>
      </Container>
    </Shell>
  );
}
