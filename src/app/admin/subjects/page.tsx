import { CollectionManager } from "@/components/admin/collection-manager";

export default function SubjectsPage() {
  return (
    <CollectionManager
      collectionName="subjects"
      title="รายวิชา"
      codeHint="เช่น math"
      deleteWarning="ข้อสอบที่ใช้วิชานี้จะแสดงเป็นรหัสวิชาแทนชื่อ"
    />
  );
}
