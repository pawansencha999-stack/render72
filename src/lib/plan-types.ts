/** One event as /plan-data.json describes it to the browser. */
export interface PlanEvent {
  id: string;
  name: string;
  title: string;
  href: string;
  blurb: string;
  online: boolean;
  venue: string;
  /** "Fri 13 Nov, 9 am" */
  when: string;
  /** [startMs, endMs, venue] for each run of sessions. */
  sessions: [number, number, string][];
  price: number;
  priceText: string;
  deadlineMs: number;
  deadline: string;
  past: boolean;
}
