import { ExamForm } from "@/components/exam/exam-form";

export default function NewExamPage() {
  return (
    <div className="space-y-4">
      <h2 className="mx-auto max-w-2xl text-xl font-semibold">สร้างชุดสอบ</h2>
      <ExamForm />
    </div>
  );
}
