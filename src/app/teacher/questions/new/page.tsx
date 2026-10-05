import { QuestionForm } from "@/components/question/question-form";

export default function NewQuestionPage() {
  return (
    <div className="space-y-4">
      <h2 className="mx-auto max-w-2xl text-xl font-semibold">เพิ่มข้อสอบ</h2>
      <QuestionForm />
    </div>
  );
}
