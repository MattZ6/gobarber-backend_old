import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, subHours } from 'date-fns';

import Appointment from '../models/Appointment';
import User from '../models/User';
import File from '../models/File';
import Nofitication from '../schemas/Notification';

import Queue from '../../lib/Queue';
import CancellationMail from '../jobs/CancellationMail';

class AppointmentController {
  async index(req, res) {
    const { limit = 10, offset = 0 } = req.query;

    const appointments = await Appointment.findAll({
      where: { user_id: req.userId },
      attributes: ['id', 'date', 'past', 'cancelable'],
      order: ['date'],
      limit,
      offset,
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['id', 'name'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['path', 'url'],
            },
          ],
        },
      ],
    });

    return res.json(appointments);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      date: Yup.date().required(),
      provider_id: Yup.number().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ message: 'Validation fails.' });
    }

    const { provider_id, date } = req.body;

    /**
     * Check if user and provider are same
     */
    if (provider_id === req.userId) {
      return res
        .status(400)
        .json({ message: "You can't register an schedule for your self" });
    }

    /**
     * Check if user is provider
     */
    const isProvider =
      (await User.count({
        where: { id: provider_id, provider: true },
      })) !== 1;

    if (isProvider) {
      return res.status(401).json({ message: 'User not found' });
    }

    /**
     * Check for past dates
     */
    const hourStart = startOfHour(parseISO(date));

    if (isBefore(hourStart, new Date())) {
      return res.status(400).json({ message: 'Past dates are not permited' });
    }

    /**
     * Check date availability
     */
    const checkAvailability = await Appointment.count({
      where: { provider_id, canceled_at: null, date: hourStart },
    });

    if (checkAvailability) {
      return res
        .status(400)
        .json({ message: 'Appointment date is not available' });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      provider_id,
      date: hourStart,
    });

    /**
     * Notify provider
     */

    const user = await User.findByPk(req.userId, {
      attributes: ['name'],
    });

    await Nofitication.create({
      client: user.name,
      date: hourStart,
      user: provider_id,
      type: 'NEW_SCHEDULE',
    });

    return res.json(appointment);
  }

  async destroy(req, res) {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['name'],
        },
      ],
    });

    if (appointment.user_id !== req.userId) {
      return res
        .status(401)
        .json({ message: 'Unauthorized to access this resource.' });
    }

    const dateWithSub = subHours(appointment.date, 2);

    const dateNow = new Date();

    if (isBefore(dateWithSub, dateNow)) {
      return res.status(422).json({
        message: 'You can only cancel appointments 2 hours in advance.',
      });
    }

    appointment.canceled_at = dateNow;

    await appointment.save();

    await Queue.add(CancellationMail.key, { appointment });

    return res.json();
  }
}

export default new AppointmentController();
