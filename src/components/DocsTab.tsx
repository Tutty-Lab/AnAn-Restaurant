import {
  DAY_WEIGHTS,
  WEEKDAY_LABELS_VI,
  WEEKDAY_SHORT_VI,
  type WeekdayKey,
} from "../lib/demand";
import { CLOSING_MAX, CLOSING_MIN, CLOSING_START, DEMAND_PROFILE, STAFFING_RULES, ruleAppliesOn, ruleRange, type DemandBand } from "../lib/staffing";
import { DEFAULT_WORK_HOURS } from "../lib/workHours";
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

function WeekdayTable() {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            {WEEKDAY_ORDER.map((key) => (
              <th key={key} className={`border border-slate-200 px-3 py-1 font-medium ${DAY_WEIGHTS[key] > 1 ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
                {WEEKDAY_LABELS_VI[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {WEEKDAY_ORDER.map((key) => (
              <td key={key} className="border border-slate-200 px-3 py-1 text-center font-semibold">
                {DAY_WEIGHTS[key].toFixed(1).replace(".", ",")}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const fmtWeight = (weight: number) => weight.toFixed(1).replace(".", ",");
const fmtRange = (min: number, max: number) => (Number.isFinite(max) ? `${min}–${max}` : `${min}+`);

/** Ngày mở cửa gom theo hệ số: [{ weight: 1, days: [T3,T4,T5] }, { weight: 1,5, days: [T6,T7,CN] }]. */
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
      {column("T3–T7 (ca gãy trưa/tối)", DEMAND_PROFILE.weekday)}
      {column("CN / ngày lễ (ca liền)", DEMAND_PROFILE.sunday)}
    </div>
  );
}

/**
 * Một dòng cho mỗi khung: mốc (hệ số 1,0) và số người thực tế theo từng nhóm hệ số.
 * Lấy thẳng từ STAFFING_RULES – cùng nguồn với thuật toán và báo cáo Độ phủ.
 */
function StaffingRulesTable() {
  const groups = weightGroups();
  const cell = "border border-slate-200 px-3 py-1.5";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-600">
            <th className={cell}>Khung</th>
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
                const onlySome = days.length < group.days.length ? ` (${days.map((day) => WEEKDAY_SHORT_VI[day]).join(", ")})` : "";
                return (
                  <td key={group.weight} className={`${cell} text-center font-semibold`}>
                    {fmtRange(minStaff, maxStaff)}<span className="font-normal text-slate-500">{onlySome}</span>
                  </td>
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
  const closingRule = STAFFING_RULES.find((rule) => rule.label === "Đóng cửa")!;
  const closingNormal = ruleRange(closingRule, "tuesday");
  const closingBusy = ruleRange(closingRule, "friday");
  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg bg-slate-900 p-4 text-white sm:p-5">
        <h1 className="text-lg font-semibold">Tài liệu — nguyên tắc xếp lịch</h1>
        <p className="mt-1 text-sm text-slate-300">
          Mô tả đúng thuật toán đang chạy. Bảng khung giờ, hệ số và đường nhu cầu bên dưới lấy thẳng từ code –
          đổi code là trang này đổi theo. Thứ tự ưu tiên khi xung đột: <b>luật & hợp đồng</b> → <b>số người tối
          thiểu/tối đa</b> → <b>đường nhu cầu</b> → <b>độ dài ca ưa thích</b>.
        </p>
      </div>

      <Section title="1. Điều kiện bắt buộc">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Giờ mở:</b> Thứ Hai đóng cửa (trùng ngày lễ vẫn đóng; override giờ riêng thì mở). <b>T3–T7:</b> 10:30–14:30 và 16:30–22:30. <b>CN/ngày lễ:</b> 10:30–22:00 liền.</li>
          <li><b>Luật giờ làm:</b> tối đa <b>9 giờ công/ngày</b>; tối đa <b>6 ngày liên tiếp</b> và 6 ngày/tuần. Trên 6h công nghỉ <b>30′</b>, trên 8h nghỉ <b>60′</b> – nghỉ có giờ cụ thể, bắt đầu sau ít nhất 1h vào ca, không làm quá 6h liền trước hoặc sau khi nghỉ.</li>
          <li><b>Hợp đồng tuần là giới hạn cứng:</b> không ISO-week nào vượt giờ ký, kể cả tuần vắt qua 2 tháng. Không xếp đủ thì báo cảnh báo, không mượn giờ tuần khác.</li>
          <li><b>Số người tối thiểu:</b> ít nhất <b>2 người thực làm</b> suốt mọi khung mở (người đang nghỉ không tính). Từ {minutesToTime(CLOSING_START)} đến đóng cửa: <b>{CLOSING_MIN}–{CLOSING_MAX} người × hệ số</b> = {closingNormal.minStaff}–{closingNormal.maxStaff} người T3–T5, <b>{closingBusy.minStaff}–{closingBusy.maxStaff} người T6–CN</b>.</li>
          <li><b>Ca:</b> mỗi ca nằm gọn trong một khung mở. T3–T7 được <b>ca gãy</b> (một phần trưa + một phần tối, mỗi phần ≥ 3h). CN/lễ chỉ <b>một ca liền</b>, dài 3–9h.</li>
          <li>Tôn trọng <b>ngày vào làm</b>, <b>ngày được làm trong tuần</b>, <b>số ngày/tuần</b> và <b>ca cố định</b> đã nhập cho từng người.</li>
        </ul>
      </Section>

      <Section title="2. Hệ số ngày và giờ công mỗi ngày">
        <p>
          <b>T6, T7, CN = 1,5</b>; ngày thường = 1,0 (ngày lễ mở cửa tính như CN). Hệ số là <b>mật độ người</b>,
          nên giờ công mỗi ngày nhân cả hệ số lẫn giờ mở cửa, chuẩn hoá trong từng ISO-week:
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{`Giờ công ngày = giờ công cả tuần × (hệ số ngày × giờ mở cửa)
              ÷ Σ (hệ số × giờ mở cửa) các ngày mở trong tuần`}</pre>
        <WeekdayTable />
        <ul className="list-disc space-y-1 pl-5">
          <li>CN mở 11,5h liền nhận nhiều giờ công hơn T6/T7 mở 10h, nên <b>cùng mật độ</b> (~7,7 giờ công mỗi giờ mở với 12 người).</li>
          <li>Các ngày cùng hệ số và cùng giờ mở (T3, T4, T5) phải có <b>cùng lượng người</b> – thuật toán không có ưu tiên ngẫu nhiên theo người hay theo thứ.</li>
          <li><b>Tuần vắt qua 2 tháng</b> chia giờ hợp đồng theo cùng hệ số × giờ mở như trên, không theo số ngày: T3+T4 cuối tháng mang ≈ 26% tuần (39h → 10h), T5–CN đầu tháng sau mang phần còn lại (29h); một Chủ nhật lẻ đầu tháng mang ≈ 22% tuần, đúng bằng CN của tuần đủ. Định mức tháng vì vậy đổi theo lịch và có thể lệch dưới 30′ do làm tròn.</li>
        </ul>
      </Section>

      <Section title="3. Khung giờ và mục tiêu nhân sự">
        <p>
          Mỗi khung có một <b>mốc</b> cho ngày hệ số 1,0. Khung <b>× hệ số</b> nhân mốc với hệ số ngày (làm tròn lên);
          khung <b>cố định</b> giữ nguyên mọi ngày. Thiếu hoặc vượt các khung này bị phạt nặng nhất trong thuật toán
          và hiện đỏ trong báo cáo Độ phủ.
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{`Số người = làm tròn lên(mốc × hệ số ngày)    ví dụ Tối T6: 4–8 × 1,5 = 6–12`}</pre>
        <StaffingRulesTable />
      </Section>

      <Section title="4. Đường nhu cầu trong ngày">
        <p>
          Giờ công của ngày được chia theo đường dưới đây thành <b>số người mục tiêu cho từng 30 phút</b>. Đường mượt
          theo từng ô 30′ (mỗi bước ~0,2) để số người lên xuống theo dạng núi: chuẩn bị → lên dốc → đỉnh → xuống dốc.
          CN có đỉnh <b>trưa</b> cao hơn đỉnh tối và dốc chuẩn bị từ 10:30.
        </p>
        <pre className="overflow-x-auto rounded bg-slate-100 p-3 text-xs text-slate-800">{`Người mục tiêu (30′) = giờ công ngày × mức ÷ Σ (mức × 30′) cả ngày`}</pre>
        <DemandCurve />
      </Section>

      <Section title="5. Thuật toán xếp lịch – các bước">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Giờ tuần của từng người:</b> hợp đồng × phần của tuần nằm trong tháng (theo hệ số), từ ngày vào làm.</li>
          <li><b>Giờ công mỗi ngày</b> theo công thức mục 2, rồi <b>số người mục tiêu mỗi 30′</b> theo đường nhu cầu mục 4.</li>
          <li><b>Chọn ngày và độ dài ca cho từng người trong tuần</b> sao cho đúng giờ tuần: toàn thời gian ưu tiên 6 ngày; độ dài ca theo hệ số × giờ mở (39h/tuần ≈ 5h T3–T5, ~7,5h T6–T7, ~8,5–9h CN).</li>
          <li><b>Đặt ca</b> ở mọi mốc 30′ trong khung. Mỗi phương án được chấm điểm theo thứ tự nặng → nhẹ: thiếu/thừa người so với khung mục 3 → lệch số người mục tiêu (bình phương) → lệch giờ công ngày → ca gãy (phạt nhẹ).</li>
          <li><b>Tinh chỉnh từng ngày:</b> dời giờ ca từng người; dời <b>giờ nghỉ</b> theo số người thực tế (rải nghỉ ra, không dồn cùng giờ, tránh giờ đóng cửa); CN/lễ thử <b>đổi vai đóng cửa</b> giữa hai người.</li>
          <li><b>Kiểm tra</b>: luật, hợp đồng tuần, ca, nghỉ và độ phủ; lỗi đỏ chặn, cảnh báo vàng không chặn in.</li>
        </ol>
      </Section>

      <Section title="6. Giới hạn thực tế (đã đo trên dữ liệu 12 người)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>CN 11:30 → 12:00 tăng vọt (6 → 10).</b> Người có mặt cả 11:30 lẫn lúc đóng cửa 22:00 phải ở lại ≥ 10,5h,
            vượt tối đa 10h (9h công + 60′ nghỉ). Đóng cửa CN cần {closingBusy.minStaff} người, nên nhóm này vào sớm nhất
            12:00; với 11 người làm CN, lúc 11:30 tối đa còn 11 − {closingBusy.minStaff} = 6 người.
          </li>
          <li>
            <b>T3–T7 có bậc lúc 11:30 và 13:30.</b> Phần trưa của ca gãy dài ≥ 3h trong khung trưa chỉ 4h, nên ai làm trưa
            cũng có mặt 11:30–13:30.
          </li>
          <li>
            <b>Chiều CN khó xuống thấp.</b> Mỗi người làm CN ~8h trong ngày mở 11,5h, nên hầu hết có mặt buổi chiều; thuật
            toán hạ chiều bằng cách rải giờ nghỉ 14:00–17:00.
          </li>
          <li>
            Đây là thuật toán heuristic (không phải solver tối ưu toàn cục). Khi các mục tiêu không cùng đạt được, lịch giữ
            phần làm được theo thứ tự ưu tiên ở đầu trang và báo rõ trong Độ phủ và cảnh báo.
          </li>
        </ul>
      </Section>

      <Section title="7. Ca cố định và giờ nghỉ">
        <p>
          Laca vẫn <b>chưa gán cho ai</b> theo yêu cầu “không cần”. Không suy đoán danh tính,
          không đổi hợp đồng 40 giờ hiện có. Khi người dùng tự chọn <code>fixedShift</code>, cửa sổ là
          <b> 06:30–14:30</b> và không được tự cắt ngắn.
        </p>
        <p>
          Giờ nghỉ là khoảng thời gian cụ thể trong ca: trên 6 giờ công cần 30 phút, trên 8 giờ cần 60 phút.
          Khoảng nghỉ kéo dài thời gian có mặt nhưng không tính vào giờ công:
        </p>
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
        <p className="text-slate-600">
          Với Laca 8 giờ có mặt và 30 phút pause, phần công là 7,5 giờ. Năm ca = 37,5 giờ,
          sáu ca = 45 giờ; riêng hợp đồng 39 giờ không thể vừa giữ cửa sổ nguyên vẹn vừa đạt chính xác.
          Phần thiếu/thừa phải báo cáo, không sửa thầm hợp đồng.
        </p>
      </Section>

      <Section title="8. Ngày đặc biệt và kiểm tra">
        <ul className="list-disc space-y-1 pl-5">
          <li>Ngày đặc biệt (override) có thể đóng cả ngày hoặc đặt khung giờ riêng; bấm <b>Tạo lịch</b> lại sau khi thêm.</li>
          <li>Sửa tay một ca vẫn phải giữ ngày được làm, hợp đồng tuần, tối đa 6 ngày liên tiếp, khung ca, giờ nghỉ và độ phủ – ca sửa tay được đánh dấu <b>Đã sửa tay</b>.</li>
          <li>Báo cáo Độ phủ ghi <b>số người thực tế / yêu cầu</b> từng 30′; thiếu hoặc vượt khung hiện viền đỏ, không chỉ dựa vào màu.</li>
        </ul>
      </Section>

      <Section title="9. Cách dùng">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Kiểm tra giờ mở, ngày lễ và ngày đặc biệt trong <b>Cài đặt</b>.</li>
          <li>Kiểm tra giờ tuần, ngày vào làm, ngày được làm và ca cố định trong <b>Nhân viên</b>.</li>
          <li>Bấm <b>Tạo lịch làm việc</b>, xem <b>Độ phủ</b> và các cảnh báo (i) trước khi xuất PDF.</li>
          <li>Sau khi sửa tay, xem lại Độ phủ và cảnh báo rồi mới xuất bản in.</li>
        </ol>
      </Section>
    </div>
  );
}
