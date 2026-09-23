import type { CrmStage, SocialHandle } from "@/lib/crm";
import { CRM_STAGES, fieldsFromSocials } from "@/lib/crm";

export const fieldClass =
  "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-orange-500 focus:outline-none";

export function Banner({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        error
          ? "border-red-800 bg-red-950/50 text-red-200"
          : "border-green-800 bg-green-950/40 text-green-200"
      }`}
    >
      {error || notice}
    </p>
  );
}

const stageStyles: Record<CrmStage, string> = {
  prospect: "bg-slate-800 text-slate-300 border-slate-600",
  contacted: "bg-yellow-900/60 text-yellow-300 border-yellow-700",
  qualified: "bg-blue-900/60 text-blue-300 border-blue-700",
  won: "bg-green-900/60 text-green-300 border-green-700",
  lost: "bg-red-900/60 text-red-300 border-red-700",
};

export function StageBadge({ stage }: { stage: string }) {
  const known = (CRM_STAGES as readonly string[]).includes(stage) ? (stage as CrmStage) : "prospect";
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${stageStyles[known]}`}
    >
      {known}
    </span>
  );
}

const outreachStyles: Record<string, string> = {
  draft: "bg-slate-800 text-slate-300 border-slate-600",
  sent: "bg-green-900/60 text-green-300 border-green-700",
  failed: "bg-red-900/60 text-red-300 border-red-700",
};

export function OutreachBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${
        outreachStyles[status] ?? outreachStyles.draft
      }`}
    >
      {status}
    </span>
  );
}

export function ProspectForm({
  action,
  submitLabel,
  defaults,
  advertisers,
  prospectId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaults?: {
    company_name?: string;
    contact_name?: string;
    email?: string | null;
    phone?: string | null;
    socials?: SocialHandle[];
    last_contact_on?: string | null;
    stage?: string;
    notes?: string | null;
    advertiser_id?: number | null;
  };
  advertisers: { id: number; name: string }[];
  prospectId?: number;
}) {
  const socials = fieldsFromSocials(defaults?.socials);
  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {prospectId != null ? <input type="hidden" name="id" value={prospectId} /> : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">
          Company <span className="text-red-400">*</span>
        </span>
        <input
          name="company_name"
          required
          maxLength={200}
          defaultValue={defaults?.company_name ?? ""}
          placeholder="e.g. Acme Sports"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">
          Contact person <span className="text-red-400">*</span>
        </span>
        <input
          name="contact_name"
          required
          maxLength={200}
          defaultValue={defaults?.contact_name ?? ""}
          placeholder="e.g. Jordan Lee"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">Email address</span>
        <input
          name="email"
          type="email"
          maxLength={320}
          defaultValue={defaults?.email ?? ""}
          placeholder="Only an address the contact gave you"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">Phone number</span>
        <input
          name="phone"
          type="tel"
          maxLength={40}
          defaultValue={defaults?.phone ?? ""}
          placeholder="e.g. (312) 555-0100"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">X / Twitter</span>
        <input
          name="social_x"
          defaultValue={socials.x}
          placeholder="@handle"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">LinkedIn</span>
        <input
          name="social_linkedin"
          defaultValue={socials.linkedin}
          placeholder="Profile URL or handle"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">Instagram</span>
        <input
          name="social_instagram"
          defaultValue={socials.instagram}
          placeholder="@handle"
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">Date of last contact</span>
        <input
          name="last_contact_on"
          type="date"
          defaultValue={defaults?.last_contact_on?.slice(0, 10) ?? ""}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-medium text-slate-400">Other social handles</span>
        <textarea
          name="social_other"
          rows={2}
          defaultValue={socials.other}
          placeholder={"One per line, e.g.\ntiktok: @acme\nyoutube: Acme Sports"}
          className={fieldClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">Stage</span>
        <select name="stage" defaultValue={defaults?.stage ?? "prospect"} className={fieldClass}>
          {CRM_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage.charAt(0).toUpperCase() + stage.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-400">Linked advertiser account</span>
        <select
          name="advertiser_id"
          defaultValue={defaults?.advertiser_id != null ? String(defaults.advertiser_id) : ""}
          className={fieldClass}
        >
          <option value="">None yet</option>
          {advertisers.map((advertiser) => (
            <option key={advertiser.id} value={advertiser.id}>
              {advertiser.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-medium text-slate-400">Notes</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={5000}
          defaultValue={defaults?.notes ?? ""}
          placeholder="How you met, what they care about, next step…"
          className={fieldClass}
        />
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-medium text-white hover:bg-orange-400"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
