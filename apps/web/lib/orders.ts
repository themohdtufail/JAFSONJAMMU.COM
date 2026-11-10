export const DEMO_ORDER = {
  number: "JF100001", phone: "9999999999", placed: "2026-11-02", total: 538800, method: "UPI",
  items: [{ slug: "tailored-navy-blazer", size: "M", colour: "Navy", qty: 1 }, { slug: "essential-white-tee", size: "L", colour: "White", qty: 1 }],
  steps: [["Order placed", "2 Nov, 11:20 am", true], ["Payment confirmed", "2 Nov, 11:21 am", true], ["Packed at Jammu showroom", "2 Nov, 4:05 pm", true], ["Dispatched", "3 Nov, 10:30 am", true], ["Out for delivery", "5 Nov, 9:10 am", false], ["Delivered", "Expected 5 Nov", false]] as [string, string, boolean][],
};
