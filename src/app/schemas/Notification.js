import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    client: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    user: {
      type: Number,
      required: true,
    },
    read: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Notification', NotificationSchema);
