import {
  DAY_WEIGHTS,
  WEEKDAY_LABELS_VI,
  WEEKDAY_SHORT_VI,
  type WeekdayKey,
} from "../lib/demand";
import { DEMAND_PROFILE, DRIVER_HOURS, GROUP_LABEL_VI, STAFFING_RULES, ruleAppliesOn, ruleRange, type DemandBand } from "../lib/staffing";
import { DEFAULT_WORK_HOURS, type DayBlocks } from "../lib/workHours";
import { SHIFT_LENGTHS } from "../lib/shifts";
import { calculatePause, minutesToTime, presenceFromPaid } from "../lib/time";

const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday", "tuesday", "wednesday", "thursday",
  "friday", "saturday", "sunday",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-2 text-base font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

const fmtWeight = (weight: number) => weight.toFixed(1).replace(".", ",");
const fmtRange = (min: number, max: number) => (Number.isFinite(max) ? (min === max ? `${min}` : `${min}–${max}`) : `${min}+`);
const fmtBlocks = (blocks: DayBlocks) =>
  blocks.map((block) => `${minutesToTime(block.startMinutes)}–${minutesToTime(block.endMinutes)}`).join(" và ");

/** Giờ mở cửa lấy thẳng từ DEFAULT_WORK_HOURS – cùng nguồn với thuật toán. */
function OpeningHoursTable() {
  const cell = "border border-slate-200 px-3 py-1";
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <tbody>
          {WEEKDAY_ORDER.map((key) => (
            <tr key={key}>
              <td className={`${cell} font-medium`}>{WEEKDAY_LABELS_VI[key]}</td>
              <td className={cell}>
                {DEFAULT_WORK_HOURS.closedWeekdays[key] ? "Đóng cửa" : fmtBlocks(DEFAULT_WORK_HOURS.perWeekday[key])}
                <span className="ml-2 text-xs text-slate-500">
                  {DEFAULT_WORK_HOURS.perWeekday[key].length > 1 ? "ca gãy trưa/tối" : "ca liền"}
                </span>
              </td>
            </tr>
          ))}
          <tr>
            <td className={`${cell} font-medium`}>Ngày lễ</td>
            <td className={cell}>{fmtBlocks(DEFAULT_WORK_HOURS.holiday)} <span className="ml-2 text-xs text-slate-500">xếp như Chủ Nhật</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function WeekdayTable() {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            {WEEKDAY_ORDER.map((key) => (
              <th key={key} className={`border border-slate-200 px-3 py-1 font-medium ${DAY_WEIGHTS[key] > 1 ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
                {WEEKDAY_SHORT_VI[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {WEEKDAY_ORDER.map((key) => (
              <td key={key} className="border border-slate-200 px-3 py-1 text-center font-semibold">{fmtWeight(DAY_WEIGHTS[key])}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Ngày mở cửa gom theo hệ số: [{ weight: 1, days: [T2..T5] }, { weight: 1,5, days: [T6,T7,CN] }]. */
function weightGroups(): { weight: number; days: WeekdayKey[] }[] {
  const groups = new Map<number, WeekdayKey[]>();
  for (const key of WEEKDAY_ORDER) {
    if (DEFAULT_WORK_HOURS.closedWeekdays[key]) continue;
    groups.set(DAY_WEIGHTS[key], [...(groups.get(DAY_WEIGHTS[key]) ?? []), key]);
  }
  return [...groups].sort((a, b) => a[0] - b[0]).map(([weight, days]) => ({ weight, days }));
}

const daysLabel = (days: WeekdayKey[]) =>
  days.length > 1 ? `${WEEKDAY_SHORT_VI[days[0]]}–${WEEKDAY_SHORT_VI[days[days.length - 1]]}` : WEEKDAY_SHORT_VI[days[0]];

/** Đường nhu cầu trong ngày – lấy thẳng từ DEMAND_PROFILE, cùng nguồn với thuật toán. */
function DemandCurve() {
  const column = (title: string, bands: readonly DemandBand[]) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-semibold text-slate-600">{title}</div>
      <ul className="space-y-1">
        {bands.map((b) => (
          <li key={b.startMinutes} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
            <span className="tabular-nums text-slate-600">{minutesToTime(b.startMinutes)}–{minutesToTime(b.endMinutes)}</span>
            <span className="relative h-4 rounded bg-slate-100" title={b.label}>
              <span
                className={`absolute inset-y-0 left-0 rounded ${b.level >= 1.5 ? "bg-amber-400" : b.level > 1 ? "bg-amber-200" : "bg-teal-300"}`}
                style={{ width: `${(b.level / 1.5) * 100}%` }}
              />
              <span className="absolute inset-0 truncate px-1.5 leading-4 text-slate-800">{b.label}</span>
            </span>
            <span className="text-right font-semibold tabular-nums">{fmtWeight(b.level)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {column("T2–T7 (chiều 14:30–17:00 chỉ T7)", DEMAND_PROFILE.default)}
      {column("CN / ngày lễ (mở 12:00)", DEMAND_PROFILE.sunday)}
    </div>
  );
}

/**
 * Một dòng cho mỗi khung: nhóm, mốc (hệ số 1,0) và số người thực tế theo từng nhóm hệ số.
 * Lấy thẳng từ STAFFING_RULES – cùng nguồn với thuật toán và báo cáo Độ phủ.
 */
function StaffingRulesTable() {
  const groups = weightGroups();
  const cell = "border border-slate-200 px-3 py-1.5";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-600">
            <th className={cell}>Khung</th>
            <th className={cell}>Nhóm</th>
            <th className={cell}>Mốc</th>
            <th className={cell}>Theo hệ số?</th>
            {groups.map((group) => (
              <th key={group.weight} className={`${cell} text-center ${group.weight > 1 ? "bg-amber-50 text-amber-900" : ""}`}>
                {daysLabel(group.days)} <span className="font-normal">×{fmtWeight(group.weight)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAFFING_RULES.map((rule) => (
            <tr key={rule.label}>
              <td className={cell}>
                <div className="font-medium text-slate-900">{rule.label}</div>
                <div className="text-xs text-slate-500">{rule.when}</div>
              </td>
              <td className={`${cell} text-xs`}>{rule.groups.map((group) => GROUP_LABEL_VI[group]).join(" + ")}</td>
              <td className={`${cell} text-center`}>{fmtRange(rule.minStaff, rule.maxStaff)}</td>
              <td className={`${cell} text-center`}>
                {rule.scaled
                  ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">× hệ số</span>
                  : <span className="text-xs text-slate-500">cố định</span>}
              </td>
              {groups.map((group) => {
                const days = group.days.filter((day) => ruleAppliesOn(rule, day));
                if (days.length === 0) return <td key={group.weight} className={`${cell} text-center text-slate-400`}>—</td>;
                const { minStaff, maxStaff } = ruleRange(rule, days[0]);
                return (
                  <td key={group.weight} className={`${cell} text-center font-semibold`}>{fmtRange(minStaff, maxStaff)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocsTab() {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg bg-slate-900 p-4 text-white sm:p-5">
        <h1 className="text-lg font-semibold">Tài liệu — nguyên tắc xếp lịch Restaurant AnAn</h1>
        <p className="mt-1 text-sm text-slate-300">
          Mô tả đúng thuật toán đang chạy. Giờ mở, bảng khung giờ, hệ số và đường nhu cầu bên dưới lấy thẳng từ code –
          đổi code là trang này đổi theo. Thứ tự ưu tiên khi xung đột: <b>luật & hợp đồng</b> → <b>số người tối
          thiểu/tối đa theo nhóm</b> → <b>đường nhu cầu</b> → <b>ưu tiên theo loại nhân viên</b>.
        </p>
      </div>

      <Section title="1. Giờ mở cửa và điều kiện bắt buộc">
        <OpeningHoursTable />
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Luật giờ làm:</b> tối đa <b>9 giờ công/ngày</b>; tối đa <b>6 ngày liên tiếp</b> và 6 ngày/tuần. Trên 6h công nghỉ <b>30′</b>, trên 8h nghỉ <b>60′</b> – nghỉ có giờ cụ thể, không làm quá 6h liền trước hoặc sau khi nghỉ.</li>
          <li><b>Hợp đồng theo tháng</b> (ví dụ 92,70h/tháng): xếp theo bậc 30′ và <b>không bao giờ vượt</b> – 92,70h → 92,5h, 173,81h → 173,5h. Giờ tháng chia về các tuần theo hệ số × giờ mở.</li>
          <li><b>Hợp đồng theo tuần</b> (Azubi 39h/tuần) là giới hạn cứng của từng ISO-week, kể cả tuần vắt qua 2 tháng.</li>
          <li><b>Kỳ học của Azubi:</b> các ngày trong kỳ học không xếp ca và không tính vào giờ hợp đồng; tuần có kỳ học giảm giờ theo phần ngày còn đi làm.</li>
          <li><b>Ca:</b> mỗi ca nằm gọn trong một khung mở. T2–T6 được <b>ca gãy</b> (một phần trưa + một phần tối, mỗi phần ≥ 3h, kể cả tuần lẻ). T7, CN và ngày lễ chỉ <b>một ca liền</b>, dài 3–9h.</li>
          <li>Tôn trọng <b>ngày vào làm</b>, <b>ngày được làm trong tuần</b>, <b>số ngày/tuần</b> và <b>ca cố định</b> đã nhập cho từng người.</li>
        </ul>
      </Section>

      <Section title="2. Nhóm nhân viên">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Bếp</b> và <b>Phục vụ</b> là người trong quán – đường nhu cầu tính trên hai nhóm này, số người tối thiểu/tối đa tính theo từng nhóm (mục 4).</li>
          <li><b>Chưa gán nhóm</b> được tính như Phục vụ cho đến khi admin gán trong tab Nhân viên.</li>
          <li>
            <b>Lái xe</b> chỉ làm <b>{fmtBlocks([DRIVER_HOURS.default])}</b>, Chủ Nhật và ngày lễ <b>{fmtBlocks([DRIVER_HOURS.sunday])}</b>
            (ca ngắn nhất 2h, ưu tiên làm đủ khung). Không tính vào người trong quán; mỗi tối cần 1–2 lái xe.
          </li>
          <li>Khung của một nhóm chưa có ai (ví dụ chưa có lái xe) được bỏ qua, không báo đỏ.</li>
        </ul>
      </Section>

      <Section title="3. Hệ số ngày và giờ công mỗi ngày">
        <p>
          <b>T6, T7, CN = 1,5</b>; T2–T5 = 1,0 (ngày lễ tính như CN). Hệ số là <b>mật độ người</b>, nên giờ công trong quán
          mỗi ngày nhân cả hệ số lẫn giờ mở cửa, chuẩn hoá trong từng ISO-week:
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{`Giờ công ngày = giờ công trong quán cả tuần × (hệ số ngày × giờ mở cửa)
              ÷ Σ (hệ số × giờ mở cửa) các ngày mở trong tuần`}</pre>
        <WeekdayTable />
      </Section>

      <Section title="4. Khung giờ và mục tiêu nhân sự">
        <p>
          Mỗi khung có một <b>mốc</b> cho ngày hệ số 1,0 và chỉ đếm người của nhóm ghi bên cạnh. Khung <b>× hệ số</b> nhân
          mốc với hệ số ngày (làm tròn lên); khung <b>cố định</b> giữ nguyên mọi ngày. Thiếu hoặc vượt bị phạt nặng nhất và
          hiện đỏ trong Độ phủ. <b>Bếp trưa đúng 2 người</b> theo quy tắc bếp của quán.
        </p>
        <StaffingRulesTable />
      </Section>

      <Section title="5. Đường nhu cầu trong ngày">
        <p>
          Giờ công trong quán của ngày được chia theo đường dưới đây thành <b>số người mục tiêu cho từng 30 phút</b>. Cao
          điểm chủ yếu <b>buổi tối 18:30–20:30</b>; trưa nhẹ hơn tối; chiều T7/CN vắng.
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{`Người mục tiêu (30′) = giờ công ngày × mức ÷ Σ (mức × 30′) cả ngày`}</pre>
        <DemandCurve />
      </Section>

      <Section title="6. Ưu tiên theo loại nhân viên">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Toàn thời gian:</b> ca và giờ làm <b>cố định</b>. Tuần đủ ngày đầu tiên tạo mẫu (thứ nào làm, giờ vào/ra); các tuần sau lệch mẫu bị phạt, nên cùng một thứ giữ cùng giờ.</li>
          <li><b>Azubi:</b> 39h/tuần, nghỉ trong kỳ học.</li>
          <li><b>Bán thời gian, Minijob, Lái xe:</b> ưu tiên <b>cao điểm tối</b> và <b>T6–CN</b> – mỗi 30′ ngoài cao điểm hoặc vào ngày vắng bị cộng điểm phạt. Người phục vụ và lái xe được xếp trước; người bếp xếp sau toàn thời gian để bếp trưa giữ đúng 2 người.</li>
        </ul>
      </Section>

      <Section title="7. Thuật toán xếp lịch – các bước">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Giờ tuần của từng người:</b> hợp đồng tuần × phần của tuần trong tháng, hoặc hợp đồng tháng (bậc 30′) chia về các tuần – bỏ ngày trước ngày vào làm và ngày kỳ học.</li>
          <li><b>Giờ công trong quán mỗi ngày</b> theo mục 3, rồi <b>số người mục tiêu mỗi 30′</b> theo mục 5.</li>
          <li><b>Thứ tự xếp:</b> ca cố định → bán thời gian/minijob phục vụ và lái xe → Azubi → toàn thời gian → bán thời gian/minijob bếp. Thứ tự tuần: tuần lẻ rất ngắn (≤ 2 ngày) ở đầu/cuối tháng xếp trước; toàn thời gian và Azubi xếp các tuần đủ rồi mới đến tuần lẻ dài (để mẫu ca không bị ép nghỉ cùng một thứ – người hợp đồng tuần mà vì thế thiếu giờ thì xếp lại theo thời gian); những người còn lại xếp theo thời gian. Mỗi người chọn ngày và độ dài ca (3–9h, lái xe 2h–đủ khung) trong tuần sao cho đúng giờ tuần.</li>
          <li><b>Chấm điểm mỗi phương án</b> theo thứ tự nặng → nhẹ: thiếu/thừa người theo nhóm (mục 4) → lệch số người mục tiêu (bình phương) → lệch giờ công ngày → ưu tiên theo loại (mục 6) → ca gãy (phạt nhẹ).</li>
          <li><b>Xếp lại từng tuần</b> cho từng người khi điểm tốt hơn, rồi <b>bù giờ còn thiếu</b>: ai còn thiếu ≥ 30′ so với định mức được kéo dài một ca sẵn có thêm 30′ ở chỗ ít làm lệch độ phủ nhất (vẫn giữ khung giờ, 9h/ngày, hợp đồng tuần). Sau đó <b>chuyển ngày làm</b>: ngày còn thiếu người của một nhóm (bếp, phục vụ, lái xe) nhận nguyên ca của một người cùng nhóm từ ngày khác trong tuần (giữ số ngày làm, tối đa 6 ngày liên tiếp). Rồi <b>dời 30′</b>: rút một ca và kéo dài ca khác của chính người đó – hợp đồng tuần trong cùng tuần, hợp đồng tháng trong cả tháng – khi độ phủ tốt hơn (tổng giờ không đổi). Giờ hợp đồng của lái xe chia theo khung chạy xe (T2–T7 3h, CN 4h), không theo hệ số ngày.</li>
          <li><b>Tinh chỉnh từng ngày</b>: dời giờ ca, dời giờ nghỉ theo số người thực tế, ngày mở liền thử đổi vai đóng cửa.</li>
          <li><b>Kiểm tra</b>: luật, hợp đồng, kỳ học, ca, nghỉ và độ phủ; lỗi đỏ chặn, cảnh báo vàng không chặn in.</li>
        </ol>
        <p className="text-slate-600">Đây là thuật toán heuristic, không phải solver tối ưu toàn cục. Mục tiêu không cùng đạt được thì giữ theo thứ tự ưu tiên ở đầu trang và báo rõ trong Độ phủ.</p>
      </Section>

      <Section title="8. Giờ nghỉ">
        <p>Giờ nghỉ là khoảng thời gian cụ thể trong ca, kéo dài thời gian có mặt nhưng không tính giờ công. Ca gãy trưa/tối không cần nghỉ vì mỗi phần ≤ 6h.</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead><tr className="bg-slate-50"><th className="border border-slate-200 px-3 py-1">Giờ công</th><th className="border border-slate-200 px-3 py-1">Pause</th><th className="border border-slate-200 px-3 py-1">Có mặt</th></tr></thead>
            <tbody>{SHIFT_LENGTHS.map((hours) => (
              <tr key={hours}>
                <td className="border border-slate-200 px-3 py-1">{hours}h</td>
                <td className="border border-slate-200 px-3 py-1">{calculatePause(hours * 60)}′</td>
                <td className="border border-slate-200 px-3 py-1">{(presenceFromPaid(hours * 60) / 60).toFixed(2).replace(".", ",")}h</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>

      <Section title="9. Ngày đặc biệt, kiểm tra và cách dùng">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Kiểm tra giờ mở, ngày lễ và ngày đặc biệt (đóng cả ngày hoặc giờ riêng) trong <b>Cài đặt</b>.</li>
          <li>Kiểm tra nhóm, hợp đồng, kỳ học Azubi, ngày vào làm và ca cố định trong <b>Nhân viên</b>.</li>
          <li>Bấm <b>Tạo lịch làm việc</b>, xem <b>Độ phủ</b> (B = bếp, P = phục vụ, LX = lái xe) và các cảnh báo (i) trước khi xuất PDF.</li>
          <li>Sửa tay một ca vẫn phải giữ luật, hợp đồng và độ phủ – xem lại Độ phủ rồi mới xuất bản in.</li>
        </ol>
      </Section>
    </div>
  );
}
