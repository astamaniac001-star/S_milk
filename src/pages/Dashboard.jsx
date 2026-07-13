import { Card, StatGrid, Btn, Section, Empty, Badge } from "../components/ui.jsx";
import { UserPlus, Package, Receipt, Scale, PauseCircle, Tag, ArrowRight, CheckCircle, XCircle, Droplet } from "lucide-react";
import { fmt } from "../lib/utils.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// FIX (AI-1 Moderate 5): Standardized property names to use `type` consistently
const QUICK_ACTIONS = [
 { label: "Add Customer", icon: UserPlus, type: "addCustomer" },
 { label: "Add Import", icon: Package, type: "addImport" },
 { label: "Generate Bills", icon: Receipt, type: "generate" }, 
 { label: "Adjustment", icon: Scale, type: "addAdj" },
 { label: "Add Pause", icon: PauseCircle, type: "addPause" },
 { label: "Add Brand", icon: Tag, type: "addBrand" },
];

// fallow-ignore-next-line complexity
function monthLabel(YYYYMM) {
 if (!YYYYMM || typeof YYYYMM !== "string" || YYYYMM.length < 7) return YYYYMM;
 const monthIdx = Number(YYYYMM.substring(5, 7)) - 1;
 if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return YYYYMM;
 return MONTH_NAMES[monthIdx];
}

export default function Dashboard({ today, todayLogs = [], bills = [], customers = [], onSetTab, onOpenModal, onGenerateBill }) {
 const customerName = (() => {
   const m = new Map();
   for (const c of customers) m.set(c.id, c.name);
   return (id) => m.get(id) || "Unknown Customer";
 })();

 const deliveredCount = todayLogs.filter((l) => l.delivered).length;
 const skippedCount = todayLogs.filter((l) => !l.delivered).length;
 const totalLiters = todayLogs
   .filter((l) => l.delivered)
   .reduce((s, l) => s + l.qty, 0)
   .toFixed(1);

 return (
   <div className="space-y-6">
     <Card>
       <h2 className="text-lg font-semibold mb-4">Today's Delivery ({today})</h2>
       <StatGrid
         stats={[
           {
             label: "View Log",
             value: "",
             icon: <ArrowRight className="w-5 h-5" />,
             action: () => onSetTab("delivery"),
           },
           { label: "Delivered", value: deliveredCount, icon: <CheckCircle className="w-5 h-5 text-green-600" /> },
           { label: "Skipped", value: skippedCount, icon: <XCircle className="w-5 h-5 text-red-600" /> },
           { label: "Total (L)", value: `${totalLiters} L`, icon: <Droplet className="w-5 h-5 text-blue-600" /> },
         ]}
       />
     </Card>

     <Section title="Quick Actions">
       <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
         {QUICK_ACTIONS.map((q) => {
           const Icon = q.icon;
           return (
             <Btn 
               key={q.label} 
               // FIX: Updated to check q.type instead of q.action
               onClick={() => q.type === "generate" ? onGenerateBill() : onOpenModal(q.type)}
             >
               <Icon className="w-4 h-4 mr-2" />
               {q.label}
             </Btn>
           );
         })}
       </div>
     </Section>

     <Card>
       <div className="flex justify-between items-center mb-4">
         <h2 className="text-lg font-semibold">Recent Bills</h2>
         <Btn variant="ghost" onClick={() => onSetTab("billing")}>
           View all <ArrowRight className="w-4 h-4 ml-1" />
         </Btn>
       </div>

       {bills.slice(0, 3).length === 0 ? (
         <Empty message="No bills generated yet." />
       ) : (
         <div className="space-y-2">
           {bills.slice(0, 3).map((b) => (
             <div key={b.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
               <div>
                 <p className="font-medium">{customerName(b.custId)}</p>
                 <p className="text-sm text-gray-500">{monthLabel(b.month)}</p>
               </div>
               <Badge color={b.status === "Paid" ? "green" : "red"}>
                 {fmt(b.amount)}
               </Badge>
             </div>
           ))}
         </div>
       )}
     </Card>
   </div>
 );
}